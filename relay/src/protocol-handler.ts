/**
 * protocol-handler.ts — WebSocket message routing for the rv WS v2 + Presence protocol.
 *
 * Handles the following message types:
 *
 *   Client → Server:
 *     room_join        — Register player, receive room_state + state_snapshot
 *     room_leave       — Explicit disconnect, broadcasts room_leave to others
 *     avatar_update    — Position/rotation broadcast (relayed as avatar_broadcast)
 *     signal_write     — Write a signal value (stored + relayed to others)
 *     drive_jog        — Start jogging a drive (stored + relayed to others)
 *     drive_stop       — Stop a drive (stored + relayed to others)
 *     cursor_ray       — Pointer ray (relayed to others, not stored)
 *
 *   Server → Client:
 *     room_state       — Full player list (sent after room_join + on changes)
 *     room_leave       — A player has left (relayed to remaining clients)
 *     avatar_broadcast — Position/rotation of another player
 *     state_snapshot   — All stored signals, drives, and existing players (late join)
 *     error            — Protocol error with code and message
 *
 * This handler is stateless in itself — all state lives in the RoomManager.
 * Each WebSocket connection is tracked in a WeakMap to its room/player context.
 */

import { WebSocket } from 'ws';
import type { RoomManager, ConnectedClient, Room } from './room-manager.js';

// ── Internal session context ────────────────────────────────────────────────

/** Per-connection session context stored in the WeakMap below. */
interface SessionContext {
  joinCode: string;
  client: ConnectedClient;
}

// ── ProtocolHandler ──────────────────────────────────────────────────────────

export class ProtocolHandler {
  private readonly _rooms: RoomManager;

  /** Maps each active WebSocket to its session context (room + player). */
  private readonly _sessions = new WeakMap<WebSocket, SessionContext>();

  // Opt 9: Per-client rate limiting — sliding-window counter
  private readonly _rateLimits = new Map<WebSocket, { count: number; windowStart: number }>();
  private static readonly MAX_MSG_PER_SECOND_CLIENT = 500;
  private static readonly MAX_MSG_PER_SECOND_HOST = 5000;

  constructor(rooms: RoomManager) {
    this._rooms = rooms;
  }

  // ── Connection lifecycle ────────────────────────────────────────────────────

  /**
   * Called when a new WebSocket connection is established.
   * At this point the client has not yet sent room_join, so we only
   * log the connection. The session context is created on room_join.
   */
  onConnect(ws: WebSocket): void {
    // Connection established — waiting for room_join
    ws.on('message', (data) => {
      try {
        const raw = data.toString();
        this._handleMessage(ws, raw);
      } catch {
        this._sendError(ws, 'parse_error', 'Failed to parse message');
      }
    });

    ws.on('close', () => {
      this.onDisconnect(ws);
    });

    ws.on('error', () => {
      // Error events are always followed by close — handle cleanup in onDisconnect
    });
  }

  /**
   * Called when a WebSocket connection closes (either gracefully or due to error).
   * Broadcasts room_leave to all remaining clients in the same room.
   */
  onDisconnect(ws: WebSocket): void {
    const session = this._sessions.get(ws);
    if (!session) return;

    const { joinCode, client } = session;
    const room = this._rooms.getRoom(joinCode);

    // Remove from room state
    this._rooms.removeClient(joinCode, client.info.id);
    this._sessions.delete(ws);
    this._rateLimits.delete(ws); // Opt 9: Clean up rate limit state

    // Broadcast room_leave to remaining clients
    if (room) {
      this._broadcastExcept(room, ws, {
        type: 'room_leave',
        id: client.info.id,
      });
    }
  }

  // ── Message routing ─────────────────────────────────────────────────────────

  // Opt 9: Sliding-window rate limiter — returns true if message is allowed
  private _checkRateLimit(ws: WebSocket): boolean {
    const now = Date.now();
    let state = this._rateLimits.get(ws);
    if (!state || now - state.windowStart >= 1000) {
      state = { count: 1, windowStart: now };
      this._rateLimits.set(ws, state);
      return true;
    }
    state.count++;
    // Host connections get a higher limit (they send drive_sync + mu_sync at 50Hz)
    const session = this._sessions.get(ws);
    const limit = session?.client.info.role === 'host'
      ? ProtocolHandler.MAX_MSG_PER_SECOND_HOST
      : ProtocolHandler.MAX_MSG_PER_SECOND_CLIENT;
    return state.count <= limit;
  }

  private _handleMessage(ws: WebSocket, raw: string): void {
    // Opt 9: Rate limit check — drop excess messages
    if (!this._checkRateLimit(ws)) return;

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      this._sendError(ws, 'invalid_json', 'Message is not valid JSON');
      return;
    }

    const type = msg['type'];
    if (typeof type !== 'string') {
      this._sendError(ws, 'missing_type', 'Message missing "type" field');
      return;
    }

    // room_join does not require an existing session
    if (type === 'room_join') {
      this._handleRoomJoin(ws, msg);
      return;
    }

    // All other message types require an established session
    const session = this._sessions.get(ws);
    if (!session) {
      this._sendError(ws, 'not_joined', 'Must send room_join before other messages');
      return;
    }

    switch (type) {
      case 'room_leave':
        this._handleRoomLeave(ws, session);
        break;
      case 'avatar_update':
        this._handleAvatarUpdate(ws, session, msg);
        break;
      case 'signal_write':
        this._handleSignalWrite(session, msg);
        break;
      case 'drive_jog':
        this._handleDriveJog(session, msg);
        break;
      case 'drive_stop':
        this._handleDriveStop(session, msg);
        break;
      case 'cursor_ray':
        this._handleCursorRay(ws, session, msg);
        break;
      // Opt 7: Path index mapping — pass-through for protocol negotiation + indexed sync
      case 'path_table':
      case 'path_table_ack':
      case 'drive_sync_idx':
      // Host-broadcast message types — pass-through to all other clients
      case 'drive_sync':
      case 'mu_sync':
      case 'avatar_broadcast':
      case 'state_snapshot':
        this._handlePassthrough(ws, session, raw);
        break;
      default:
        // Unknown message types are silently ignored for forward compatibility
        break;
    }
  }

  // ── Handler implementations ─────────────────────────────────────────────────

  /**
   * Handle room_join: register the player, create session context,
   * broadcast updated room_state to all, and send state_snapshot to the new joiner.
   */
  private _handleRoomJoin(ws: WebSocket, msg: Record<string, unknown>): void {
    const name = typeof msg['name'] === 'string' ? msg['name'] : 'Unknown';
    const color = typeof msg['color'] === 'string' ? msg['color'] : '#2196F3';
    const role = typeof msg['role'] === 'string' ? msg['role'] : 'observer';
    const xrMode = typeof msg['xrMode'] === 'string' ? msg['xrMode'] : 'none';

    // The join code is either provided in the message or we create a new room.
    // If msg.joinCode is present and the room exists, join it.
    // If msg.joinCode is present but the room does not exist, create it with that code.
    // If no joinCode is provided, generate a new room.
    let joinCode: string;
    if (typeof msg['joinCode'] === 'string' && msg['joinCode'].length > 0) {
      joinCode = (msg['joinCode'] as string).toUpperCase();
      // Validate code format: 6 alphanumeric chars
      if (!/^[A-Z0-9]{6}$/.test(joinCode)) {
        this._sendError(ws, 'invalid_join_code', 'Join code must be 6 uppercase alphanumeric characters');
        return;
      }
    } else {
      joinCode = this._rooms.createRoom();
    }

    const client = this._rooms.addClient(joinCode, ws, { name, color, role, xrMode });
    this._sessions.set(ws, { joinCode, client });

    const room = this._rooms.getRoom(joinCode);
    if (!room) {
      this._sendError(ws, 'room_error', 'Failed to join or create room');
      return;
    }

    // Send room_state to ALL clients (including the new joiner so they know their own id)
    const players = Array.from(room.clients.values()).map(c => c.info);
    this._broadcastAll(room, {
      type: 'room_state',
      joinCode,
      players,
    });

    // Send state_snapshot only to the new joiner (late-join recovery)
    const snapshot = this._rooms.buildStateSnapshot(joinCode);
    if (snapshot) {
      this._send(ws, {
        type: 'state_snapshot',
        signals: snapshot.signals,
        drives: snapshot.drives,
        players: snapshot.players,
      });
    }
  }

  /**
   * Handle explicit room_leave from client.
   * Equivalent to disconnect — removes player and broadcasts room_leave.
   */
  private _handleRoomLeave(ws: WebSocket, session: SessionContext): void {
    const { joinCode, client } = session;
    const room = this._rooms.getRoom(joinCode);

    this._rooms.removeClient(joinCode, client.info.id);
    this._sessions.delete(ws);

    if (room) {
      this._broadcastExcept(room, ws, {
        type: 'room_leave',
        id: client.info.id,
      });
    }
  }

  /**
   * Handle avatar_update: relay as avatar_broadcast to all OTHER clients.
   * The sender's own update is not echoed back.
   */
  private _handleAvatarUpdate(
    ws: WebSocket,
    session: SessionContext,
    msg: Record<string, unknown>,
  ): void {
    const room = this._rooms.getRoom(session.joinCode);
    if (!room) return;

    this._broadcastExcept(room, ws, {
      type: 'avatar_broadcast',
      id: session.client.info.id,
      headPos: msg['headPos'],
      headRot: msg['headRot'],
      cameraTarget: msg['cameraTarget'],
      leftCtrl: msg['leftCtrl'] ?? null,
      rightCtrl: msg['rightCtrl'] ?? null,
    });
  }

  /**
   * Handle signal_write: store the latest value and relay to all OTHER clients.
   * Both "operator" and "observer" roles are accepted at the relay level;
   * Unity's MultiplayerWEB component enforces role-based access on the simulation side.
   */
  private _handleSignalWrite(session: SessionContext, msg: Record<string, unknown>): void {
    const room = this._rooms.getRoom(session.joinCode);
    if (!room) return;

    // Support both 'name' (relay convention) and 'signalPath' (client sends signalPath)
    const signalName =
      typeof msg['name'] === 'string' ? msg['name'] :
      typeof msg['signalPath'] === 'string' ? msg['signalPath'] : null;
    const value = msg['value'];

    if (signalName === null || (typeof value !== 'boolean' && typeof value !== 'number')) return;

    // Store for late joiners
    this._rooms.setSignal(session.joinCode, signalName, value as boolean | number);

    // Relay to all other clients (not the sender — they already applied it locally)
    const senderWs = session.client.ws;
    this._broadcastExcept(room, senderWs, {
      type: 'signal_write',
      // Forward using signalPath so the client-side handler recognises it
      signalPath: signalName,
      name: signalName,
      value,
    });
  }

  /**
   * Handle drive_jog: store the drive state and relay to all OTHER clients.
   */
  private _handleDriveJog(session: SessionContext, msg: Record<string, unknown>): void {
    const room = this._rooms.getRoom(session.joinCode);
    if (!room) return;

    // Support both 'name' (relay) and 'drivePath' (client sends drivePath)
    const drivePath =
      typeof msg['name'] === 'string' ? msg['name'] :
      typeof msg['drivePath'] === 'string' ? msg['drivePath'] : null;
    const forward = typeof msg['forward'] === 'boolean' ? msg['forward'] : true;

    if (drivePath === null) return;

    this._rooms.setDriveState(session.joinCode, drivePath, { jogging: true, forward });

    const senderWs = session.client.ws;
    this._broadcastExcept(room, senderWs, {
      type: 'drive_jog',
      drivePath,
      name: drivePath,
      forward,
    });
  }

  /**
   * Handle drive_stop: store the stopped state and relay to all OTHER clients.
   */
  private _handleDriveStop(session: SessionContext, msg: Record<string, unknown>): void {
    const room = this._rooms.getRoom(session.joinCode);
    if (!room) return;

    const drivePath =
      typeof msg['name'] === 'string' ? msg['name'] :
      typeof msg['drivePath'] === 'string' ? msg['drivePath'] : null;

    if (drivePath === null) return;

    this._rooms.setDriveState(session.joinCode, drivePath, { jogging: false, forward: false });

    const senderWs = session.client.ws;
    this._broadcastExcept(room, senderWs, {
      type: 'drive_stop',
      drivePath,
      name: drivePath,
    });
  }

  /**
   * Handle cursor_ray: relay to all OTHER clients without storing state.
   * Cursor rays are ephemeral UI hints and do not need late-join recovery.
   */
  private _handleCursorRay(
    ws: WebSocket,
    session: SessionContext,
    msg: Record<string, unknown>,
  ): void {
    const room = this._rooms.getRoom(session.joinCode);
    if (!room) return;

    this._broadcastExcept(room, ws, {
      type: 'cursor_ray',
      id: session.client.info.id,
      origin: msg['origin'],
      direction: msg['direction'],
    });
  }

  /**
   * Pass-through handler for host-broadcast message types (drive_sync, mu_sync,
   * path_table, path_table_ack, drive_sync_idx, state_snapshot, avatar_broadcast).
   * Relays the raw JSON to all other clients without parsing or storing.
   */
  private _handlePassthrough(ws: WebSocket, session: SessionContext, raw: string): void {
    const room = this._rooms.getRoom(session.joinCode);
    if (!room) return;

    for (const client of room.clients.values()) {
      if (client.ws !== ws) {
        this._sendRaw(client.ws, raw);
      }
    }
  }

  // ── Broadcast helpers ──────────────────────────────────────────────────────

  /**
   * Send a message to ALL clients in a room (including the trigger if present).
   */
  private _broadcastAll(room: Room, payload: object): void {
    const json = JSON.stringify(payload);
    for (const client of room.clients.values()) {
      this._sendRaw(client.ws, json);
    }
  }

  /**
   * Send a message to all clients in a room EXCEPT the specified sender.
   * Used to relay messages without echoing back to the originator.
   */
  private _broadcastExcept(room: Room, sender: WebSocket, payload: object): void {
    const json = JSON.stringify(payload);
    for (const client of room.clients.values()) {
      if (client.ws !== sender) {
        this._sendRaw(client.ws, json);
      }
    }
  }

  /** Send a structured payload to a single client. */
  private _send(ws: WebSocket, payload: object): void {
    this._sendRaw(ws, JSON.stringify(payload));
  }

  /** Send a pre-serialised JSON string to a single client (no re-serialisation). */
  private _sendRaw(ws: WebSocket, json: string): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(json);
    } catch {
      // Socket closed between readyState check and send — ignore
    }
  }

  /** Send an error message to a single client. */
  private _sendError(ws: WebSocket, code: string, message: string): void {
    this._send(ws, { type: 'error', code, message });
  }
}
