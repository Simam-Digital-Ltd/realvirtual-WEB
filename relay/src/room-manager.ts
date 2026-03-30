/**
 * room-manager.ts — Room lifecycle and player tracking for the relay server.
 *
 * A Room is a shared session identified by a 6-character join code.
 * Each connected client is a Player with a unique UUID assigned by the server.
 *
 * State tracked per room:
 *   - Connected players (PlayerInfo + WebSocket reference)
 *   - Latest signal values (name → value) for state_snapshot on late join
 *   - Latest drive jogging state (name → DriveState) for state_snapshot
 *
 * Rooms are auto-cleaned up EMPTY_ROOM_TIMEOUT_MS after the last player leaves.
 * This prevents memory leaks from abandoned sessions.
 */

import { WebSocket } from 'ws';
import { generateJoinCode } from './join-code.js';

// ── Public types ──────────────────────────────────────────────────────────────

/** Player info stored per connected client. */
export interface PlayerInfo {
  id: string;        // server-assigned UUID
  name: string;      // display name from room_join
  color: string;     // hex color string, e.g. "#2196F3"
  role: string;      // "operator" | "observer"
  xrMode: string;    // "none" | "vr" | "ar"
}

/** Snapshot of the latest known drive state for a given drive path. */
export interface DriveState {
  jogging: boolean;
  forward: boolean;
}

/** Signal value snapshot entry used in state_snapshot. */
export interface SignalSnapshot {
  path: string;
  type: 'bool' | 'float';
  value: boolean | number;
}

/** Drive snapshot entry used in state_snapshot. */
export interface DriveSnapshot {
  path: string;
  position: number;
}

/** Full state snapshot sent to late joiners. */
export interface StateSnapshot {
  signals: SignalSnapshot[];
  drives: DriveSnapshot[];
  players: PlayerInfo[];
  annotations?: Record<string, unknown>[];
  sharedViewActive?: boolean;
  sharedViewOperatorId?: string;
}

// ── Internal types ────────────────────────────────────────────────────────────

/** Internal record associating a PlayerInfo with its live WebSocket connection. */
export interface ConnectedClient {
  info: PlayerInfo;
  ws: WebSocket;
}

/** Internal room record. */
export interface Room {
  joinCode: string;
  clients: Map<string, ConnectedClient>;    // keyed by player id
  signals: Map<string, boolean | number>;   // latest signal values by signal name
  driveStates: Map<string, DriveState>;     // latest drive states by drive path
  cleanupTimer: ReturnType<typeof setTimeout> | null;
  /** Stored annotations for late-joiner recovery. */
  annotations: Map<string, Record<string, unknown>>;
  /** ID of the operator currently sharing their view, or null. */
  sharedViewOperatorId: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Milliseconds to wait before cleaning up an empty room. */
const EMPTY_ROOM_TIMEOUT_MS = 30_000;

/** Maximum attempts to generate a unique join code before giving up. */
const MAX_CODE_GENERATION_ATTEMPTS = 100;

// ── RoomManager ───────────────────────────────────────────────────────────────

export class RoomManager {
  private readonly _rooms: Map<string, Room> = new Map();

  // ── Room lifecycle ──────────────────────────────────────────────────────────

  /**
   * Create a new empty room and return its join code.
   * Retries code generation up to MAX_CODE_GENERATION_ATTEMPTS times
   * to guarantee uniqueness across concurrent rooms.
   *
   * @throws Error if a unique code cannot be generated within the attempt limit.
   */
  createRoom(): string {
    for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
      const code = generateJoinCode();
      if (!this._rooms.has(code)) {
        const room: Room = {
          joinCode: code,
          clients: new Map(),
          signals: new Map(),
          driveStates: new Map(),
          cleanupTimer: null,
          annotations: new Map(),
          sharedViewOperatorId: null,
        };
        this._rooms.set(code, room);
        return code;
      }
    }
    throw new Error(`Failed to generate unique join code after ${MAX_CODE_GENERATION_ATTEMPTS} attempts`);
  }

  /**
   * Look up a room by join code.
   * @returns The Room if found, or undefined.
   */
  getRoom(joinCode: string): Room | undefined {
    return this._rooms.get(joinCode);
  }

  /**
   * Get or create a room for the given join code.
   * Used to allow clients to connect directly by supplying a code
   * (the first joiner implicitly creates the room).
   */
  getOrCreateRoom(joinCode: string): Room {
    let room = this._rooms.get(joinCode);
    if (!room) {
      room = {
        joinCode,
        clients: new Map(),
        signals: new Map(),
        driveStates: new Map(),
        cleanupTimer: null,
        annotations: new Map(),
        sharedViewOperatorId: null,
      };
      this._rooms.set(joinCode, room);
    }
    // Cancel any pending cleanup since a new client is about to join
    if (room.cleanupTimer !== null) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }
    return room;
  }

  /** Returns all currently active room join codes. */
  get roomCodes(): string[] {
    return Array.from(this._rooms.keys());
  }

  /** Returns the total number of active rooms. */
  get roomCount(): number {
    return this._rooms.size;
  }

  // ── Player management ───────────────────────────────────────────────────────

  /**
   * Add a client to a room.
   * The player id is server-assigned and returned in the ConnectedClient.
   *
   * @param joinCode  Room identifier (created if it does not exist).
   * @param ws        Client's WebSocket connection.
   * @param info      Player info from the room_join message (id will be overwritten).
   * @returns The ConnectedClient record added to the room.
   */
  addClient(joinCode: string, ws: WebSocket, info: Omit<PlayerInfo, 'id'>): ConnectedClient {
    const room = this.getOrCreateRoom(joinCode);
    const playerId = generatePlayerId();
    const playerInfo: PlayerInfo = { ...info, id: playerId };
    const client: ConnectedClient = { info: playerInfo, ws };
    room.clients.set(playerId, client);
    return client;
  }

  /**
   * Remove a client from whichever room they belong to.
   * Triggers room cleanup scheduling if the room becomes empty.
   *
   * @param joinCode  The room the client is in.
   * @param playerId  The server-assigned player id.
   */
  removeClient(joinCode: string, playerId: string): void {
    const room = this._rooms.get(joinCode);
    if (!room) return;

    room.clients.delete(playerId);

    if (room.clients.size === 0) {
      this._scheduleRoomCleanup(room);
    }
  }

  /**
   * Find which room a given WebSocket belongs to, if any.
   * Scans all rooms — use sparingly (O(rooms × clients)).
   *
   * @returns { room, client } if found, or undefined.
   */
  findClientByWebSocket(ws: WebSocket): { room: Room; client: ConnectedClient } | undefined {
    for (const room of this._rooms.values()) {
      for (const client of room.clients.values()) {
        if (client.ws === ws) {
          return { room, client };
        }
      }
    }
    return undefined;
  }

  // ── State management ────────────────────────────────────────────────────────

  /**
   * Store (or update) the latest value for a signal in the given room.
   * Called on every signal_write message so late joiners receive current values.
   *
   * @param joinCode   Room identifier.
   * @param signalName Signal path/name.
   * @param value      Latest signal value.
   */
  setSignal(joinCode: string, signalName: string, value: boolean | number): void {
    const room = this._rooms.get(joinCode);
    if (!room) return;
    room.signals.set(signalName, value);
  }

  /**
   * Record the latest drive state (jogging direction) for a room.
   * Called on drive_jog and drive_stop so late joiners get current state.
   *
   * @param joinCode  Room identifier.
   * @param drivePath Drive path/name.
   * @param state     Latest drive state.
   */
  setDriveState(joinCode: string, drivePath: string, state: DriveState): void {
    const room = this._rooms.get(joinCode);
    if (!room) return;
    room.driveStates.set(drivePath, state);
  }

  /**
   * Build a state_snapshot payload for the given room.
   * Includes all stored signal values, drive states, and connected player list.
   *
   * @param joinCode  Room identifier.
   * @returns StateSnapshot or null if the room does not exist.
   */
  buildStateSnapshot(joinCode: string): StateSnapshot | null {
    const room = this._rooms.get(joinCode);
    if (!room) return null;

    const signals: SignalSnapshot[] = [];
    for (const [path, value] of room.signals) {
      const type: 'bool' | 'float' = typeof value === 'boolean' ? 'bool' : 'float';
      signals.push({ path, type, value });
    }

    const drives: DriveSnapshot[] = [];
    for (const [path] of room.driveStates) {
      // The relay does not track actual drive positions (no simulation),
      // so we emit position 0 as a placeholder. The client uses this to
      // confirm the drive exists in the scene, not to snap to a position.
      drives.push({ path, position: 0 });
    }

    const players: PlayerInfo[] = Array.from(room.clients.values()).map(c => c.info);

    // Include annotations for late-joiner recovery
    const annotations = Array.from(room.annotations.values());

    return {
      signals,
      drives,
      players,
      ...(annotations.length > 0 ? { annotations } : {}),
      ...(room.sharedViewOperatorId ? {
        sharedViewActive: true,
        sharedViewOperatorId: room.sharedViewOperatorId,
      } : {}),
    };
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private _scheduleRoomCleanup(room: Room): void {
    if (room.cleanupTimer !== null) return;
    room.cleanupTimer = setTimeout(() => {
      // Double-check the room is still empty before deleting
      if (room.clients.size === 0) {
        this._rooms.delete(room.joinCode);
      }
    }, EMPTY_ROOM_TIMEOUT_MS);
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Generate a UUID v4-style player id using Node's crypto module. */
function generatePlayerId(): string {
  // Use crypto.randomUUID() available in Node 14.17+
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).crypto?.randomUUID?.() ?? fallbackUUID();
}

/** Fallback UUID generator for environments without crypto.randomUUID. */
function fallbackUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
