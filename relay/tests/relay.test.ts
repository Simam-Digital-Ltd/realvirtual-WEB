/**
 * relay.test.ts — Integration and unit tests for the realvirtual relay server.
 *
 * Tests cover:
 *   - Room creation and join code generation (unit)
 *   - Client join → room_state broadcast
 *   - Avatar update → broadcast to others (not sender)
 *   - Signal write → stored + relayed to others
 *   - Drive jog/stop → stored + relayed to others
 *   - Client disconnect → room_leave broadcast + player removed from room_state
 *   - Late joiner receives state_snapshot with accumulated state
 *   - Empty room cleanup after timeout
 *   - Multiple rooms isolation (signals/players do not leak across rooms)
 *   - Protocol error handling (missing type, not joined)
 *   - Cursor ray relay (not stored, only forwarded)
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import WebSocket from 'ws';
import http from 'http';
import { RoomManager } from '../src/room-manager.js';
import { generateJoinCode, JOIN_CODE_LENGTH } from '../src/join-code.js';
import { createServer } from '../src/server.js';

// ── Test client helper ────────────────────────────────────────────────────────

/**
 * Managed test client that collects ALL incoming messages into a queue.
 * Tests dequeue messages by type rather than waiting for the next sequential message.
 * This avoids ordering fragility when the server sends multiple message types
 * in quick succession (e.g. room_state + state_snapshot on join).
 */
class TestClient {
  private readonly _ws: WebSocket;
  private readonly _queue: Record<string, unknown>[] = [];
  private readonly _listeners: Array<(msg: Record<string, unknown>) => void> = [];
  public readonly closed: Promise<void>;

  constructor(ws: WebSocket) {
    this._ws = ws;
    this.closed = new Promise((resolve) => {
      ws.once('close', resolve);
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as Record<string, unknown>;
      this._queue.push(msg);
      // Notify any pending waiters
      for (const listener of this._listeners.splice(0)) {
        listener(msg);
      }
    });
  }

  static async connect(url: string): Promise<TestClient> {
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const w = new WebSocket(url);
      w.once('open', () => resolve(w));
      w.once('error', reject);
    });
    return new TestClient(ws);
  }

  send(payload: object): void {
    this._ws.send(JSON.stringify(payload));
  }

  close(): void {
    this._ws.close();
  }

  /**
   * Wait for the next message of the given type anywhere in the queue.
   * Scans already-received messages first, then waits for new ones.
   */
  waitFor(type: string, timeoutMs = 3000): Promise<Record<string, unknown>> {
    // Check already-received messages
    const idx = this._queue.findIndex(m => m['type'] === type);
    if (idx !== -1) {
      return Promise.resolve(this._queue.splice(idx, 1)[0]!);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          reject(new Error(`[TestClient] Timed out waiting for type="${type}". Queue: ${JSON.stringify(this._queue.map(m => m['type']))}`));
        },
        timeoutMs,
      );

      const check = (msg: Record<string, unknown>) => {
        if (msg['type'] === type) {
          clearTimeout(timer);
          // Remove from queue if it arrived via the queue path
          const qi = this._queue.indexOf(msg);
          if (qi !== -1) this._queue.splice(qi, 1);
          resolve(msg);
        } else {
          // Wrong type — re-register listener for the next message
          this._listeners.push(check);
        }
      };
      this._listeners.push(check);
    });
  }

  /** Collect messages of any type received within durationMs. Does not drain queue. */
  async collect(durationMs: number): Promise<Record<string, unknown>[]> {
    const msgs: Record<string, unknown>[] = [];
    const handler = (data: WebSocket.RawData) => {
      msgs.push(JSON.parse(data.toString()) as Record<string, unknown>);
    };
    this._ws.on('message', handler);
    await new Promise(r => setTimeout(r, durationMs));
    this._ws.off('message', handler);
    return msgs;
  }

  /** Messages currently in the internal queue (already received, not yet consumed). */
  get queuedMessages(): Record<string, unknown>[] {
    return [...this._queue];
  }
}

// ── Server lifecycle helper ───────────────────────────────────────────────────

async function startTestServer(): Promise<{
  url: string;
  httpUrl: string;
  httpServer: http.Server;
  rooms: RoomManager;
  close: () => Promise<void>;
}> {
  const { httpServer, rooms } = createServer({ port: 0, modelPath: null });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve);
  });

  const addr = httpServer.address() as { port: number };
  const url = `ws://127.0.0.1:${addr.port}`;
  const httpUrl = `http://127.0.0.1:${addr.port}`;

  const close = () =>
    new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });

  return { url, httpUrl, httpServer, rooms, close };
}

// ── Unit Tests: join-code ─────────────────────────────────────────────────────

describe('join-code generation', () => {
  it('generates a code of the correct length', () => {
    const code = generateJoinCode();
    expect(code).toHaveLength(JOIN_CODE_LENGTH);
  });

  it('generated code contains only uppercase letters and digits', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateJoinCode();
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    }
  });

  it('generates different codes on repeated calls (probabilistic)', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateJoinCode()));
    expect(codes.size).toBe(20);
  });
});

// ── Unit Tests: RoomManager ───────────────────────────────────────────────────

describe('RoomManager', () => {
  let rooms: RoomManager;

  beforeEach(() => {
    rooms = new RoomManager();
  });

  it('createRoom returns a valid join code and increments roomCount', () => {
    const code = rooms.createRoom();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(rooms.roomCount).toBe(1);
  });

  it('createRoom generates unique codes for multiple rooms', () => {
    const codes = new Set(Array.from({ length: 10 }, () => rooms.createRoom()));
    expect(codes.size).toBe(10);
  });

  it('getRoom returns undefined for unknown code', () => {
    expect(rooms.getRoom('XXXXXX')).toBeUndefined();
  });

  it('getRoom returns the created room', () => {
    const code = rooms.createRoom();
    const room = rooms.getRoom(code);
    expect(room).toBeDefined();
    expect(room!.joinCode).toBe(code);
  });

  it('setSignal stores a signal value', () => {
    const code = rooms.createRoom();
    rooms.setSignal(code, 'Cell/Start', true);
    const snapshot = rooms.buildStateSnapshot(code);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.signals).toHaveLength(1);
    expect(snapshot!.signals[0]?.path).toBe('Cell/Start');
    expect(snapshot!.signals[0]?.value).toBe(true);
  });

  it('setSignal overwrites previous value for same key', () => {
    const code = rooms.createRoom();
    rooms.setSignal(code, 'Speed', 10);
    rooms.setSignal(code, 'Speed', 42);
    const snapshot = rooms.buildStateSnapshot(code);
    expect(snapshot!.signals).toHaveLength(1);
    expect(snapshot!.signals[0]?.value).toBe(42);
  });

  it('setDriveState stores a drive state', () => {
    const code = rooms.createRoom();
    rooms.setDriveState(code, 'Robot/Drive1', { jogging: true, forward: false });
    const snapshot = rooms.buildStateSnapshot(code);
    expect(snapshot!.drives).toHaveLength(1);
    expect(snapshot!.drives[0]?.path).toBe('Robot/Drive1');
  });

  it('buildStateSnapshot returns null for unknown room', () => {
    expect(rooms.buildStateSnapshot('XXXXXX')).toBeNull();
  });

  it('buildStateSnapshot includes signal type correctly', () => {
    const code = rooms.createRoom();
    rooms.setSignal(code, 'BoolSig', true);
    rooms.setSignal(code, 'FloatSig', 3.14);
    const snapshot = rooms.buildStateSnapshot(code);
    const boolEntry = snapshot!.signals.find(s => s.path === 'BoolSig');
    const floatEntry = snapshot!.signals.find(s => s.path === 'FloatSig');
    expect(boolEntry?.type).toBe('bool');
    expect(floatEntry?.type).toBe('float');
  });

  it('empty room cleanup fires after timeout', () => {
    vi.useFakeTimers();
    const rooms2 = new RoomManager();
    const code = rooms2.createRoom();
    expect(rooms2.roomCount).toBe(1);

    const room = rooms2.getRoom(code);
    expect(room).toBeDefined();

    // Access private method via type coercion to simulate cleanup scheduling
    (rooms2 as unknown as { _scheduleRoomCleanup: (r: unknown) => void })
      ['_scheduleRoomCleanup'](room);

    expect(rooms2.roomCount).toBe(1);
    vi.advanceTimersByTime(31_000);
    expect(rooms2.roomCount).toBe(0);

    vi.useRealTimers();
  });
});

// ── Integration Tests ─────────────────────────────────────────────────────────

describe('Integration: relay server', () => {
  let url: string;
  let httpUrl: string;
  let close: () => Promise<void>;

  beforeEach(async () => {
    const srv = await startTestServer();
    url = srv.url;
    httpUrl = srv.httpUrl;
    close = srv.close;
  });

  afterEach(async () => {
    await close();
  });

  // ── Room join ──

  it('client joins and receives room_state with their own player info', async () => {
    const c = await TestClient.connect(url);
    c.send({ type: 'room_join', name: 'Alice', color: '#FF0000', role: 'operator' });

    const msg = await c.waitFor('room_state');
    const players = msg['players'] as Array<Record<string, unknown>>;
    expect(players).toHaveLength(1);
    expect(players[0]?.['name']).toBe('Alice');
    expect(players[0]?.['role']).toBe('operator');
    expect(players[0]?.['id']).toBeTruthy();

    c.close();
  });

  it('first joiner receives state_snapshot immediately after room_state', async () => {
    const c = await TestClient.connect(url);
    c.send({ type: 'room_join', name: 'Alice', color: '#FF0000', role: 'operator' });

    await c.waitFor('room_state');
    const snapshot = await c.waitFor('state_snapshot');
    expect(snapshot['type']).toBe('state_snapshot');
    // First joiner has empty snapshot
    expect(snapshot['signals']).toEqual([]);

    c.close();
  });

  it('second client joins and both receive updated room_state with 2 players', async () => {
    const c1 = await TestClient.connect(url);
    c1.send({ type: 'room_join', name: 'Alice', color: '#FF0000', role: 'operator' });
    const state1 = await c1.waitFor('room_state');
    const joinCode = state1['joinCode'] as string;

    const c2 = await TestClient.connect(url);
    c2.send({ type: 'room_join', name: 'Bob', color: '#00FF00', role: 'observer', joinCode });

    // Both clients should receive room_state with 2 players
    // c1 gets an update when c2 joins; c2 gets it as part of join
    const [msg1, msg2] = await Promise.all([
      c1.waitFor('room_state'),
      c2.waitFor('room_state'),
    ]);

    const p1 = msg1['players'] as Array<Record<string, unknown>>;
    const p2 = msg2['players'] as Array<Record<string, unknown>>;
    expect(p1).toHaveLength(2);
    expect(p2).toHaveLength(2);
    expect(p1.map(p => p['name'])).toContain('Alice');
    expect(p1.map(p => p['name'])).toContain('Bob');

    c1.close();
    c2.close();
  });

  // ── Avatar update ──

  it('avatar_update from client A is received as avatar_broadcast by client B (not A)', async () => {
    const c1 = await TestClient.connect(url);
    c1.send({ type: 'room_join', name: 'Alice', color: '#FF0000', role: 'operator' });
    const state1 = await c1.waitFor('room_state');
    const joinCode = state1['joinCode'] as string;

    const c2 = await TestClient.connect(url);
    c2.send({ type: 'room_join', name: 'Bob', color: '#00FF00', role: 'observer', joinCode });

    // Wait for both clients to be fully joined (2-player room_state)
    await Promise.all([c1.waitFor('room_state'), c2.waitFor('room_state')]);

    // Alice sends an avatar update
    c1.send({
      type: 'avatar_update',
      headPos: [1.0, 2.0, 3.0],
      headRot: [0, 0, 0, 1],
      cameraTarget: [0, 0, 0],
    });

    // Bob receives avatar_broadcast
    const broadcast = await c2.waitFor('avatar_broadcast');
    expect(broadcast['type']).toBe('avatar_broadcast');
    expect(broadcast['headPos']).toEqual([1.0, 2.0, 3.0]);
    expect(broadcast['headRot']).toEqual([0, 0, 0, 1]);
    expect(broadcast['id']).toBeTruthy();

    // Alice should NOT receive her own avatar_broadcast
    const aliceMsgs = await c1.collect(150);
    expect(aliceMsgs.filter(m => m['type'] === 'avatar_broadcast')).toHaveLength(0);

    c1.close();
    c2.close();
  });

  // ── Signal write ──

  it('signal_write is relayed to other clients and stored', async () => {
    const c1 = await TestClient.connect(url);
    c1.send({ type: 'room_join', name: 'Op', color: '#FF0000', role: 'operator' });
    const state1 = await c1.waitFor('room_state');
    const joinCode = state1['joinCode'] as string;

    const c2 = await TestClient.connect(url);
    c2.send({ type: 'room_join', name: 'Obs', color: '#00FF00', role: 'observer', joinCode });

    await Promise.all([c1.waitFor('room_state'), c2.waitFor('room_state')]);

    // Operator writes a signal
    c1.send({ type: 'signal_write', signalPath: 'Cell/Start', value: true });

    // Observer receives the relayed signal
    const relayed = await c2.waitFor('signal_write');
    expect(relayed['type']).toBe('signal_write');
    expect(relayed['value']).toBe(true);

    // Operator does NOT receive their own signal back
    const opMsgs = await c1.collect(100);
    expect(opMsgs.filter(m => m['type'] === 'signal_write')).toHaveLength(0);

    c1.close();
    c2.close();
  });

  // ── Drive jog/stop ──

  it('drive_jog is relayed to other clients', async () => {
    const c1 = await TestClient.connect(url);
    c1.send({ type: 'room_join', name: 'Op', color: '#FF0000', role: 'operator' });
    const state1 = await c1.waitFor('room_state');
    const joinCode = state1['joinCode'] as string;

    const c2 = await TestClient.connect(url);
    c2.send({ type: 'room_join', name: 'Obs', color: '#0000FF', role: 'observer', joinCode });
    await Promise.all([c1.waitFor('room_state'), c2.waitFor('room_state')]);

    c1.send({ type: 'drive_jog', drivePath: 'Robot/Axis1', forward: true });

    const relayed = await c2.waitFor('drive_jog');
    expect(relayed['type']).toBe('drive_jog');
    expect(relayed['forward']).toBe(true);

    c1.close();
    c2.close();
  });

  it('drive_stop is relayed to other clients', async () => {
    const c1 = await TestClient.connect(url);
    c1.send({ type: 'room_join', name: 'Op', color: '#FF0000', role: 'operator' });
    const state1 = await c1.waitFor('room_state');
    const joinCode = state1['joinCode'] as string;

    const c2 = await TestClient.connect(url);
    c2.send({ type: 'room_join', name: 'Obs', color: '#0000FF', role: 'observer', joinCode });
    await Promise.all([c1.waitFor('room_state'), c2.waitFor('room_state')]);

    c1.send({ type: 'drive_stop', drivePath: 'Robot/Axis1' });

    const relayed = await c2.waitFor('drive_stop');
    expect(relayed['type']).toBe('drive_stop');

    c1.close();
    c2.close();
  });

  // ── Late joiner state_snapshot ──

  it('late joiner receives state_snapshot with accumulated signals and drives', async () => {
    const c1 = await TestClient.connect(url);
    c1.send({ type: 'room_join', name: 'First', color: '#FF0000', role: 'operator' });
    const state1 = await c1.waitFor('room_state');
    const joinCode = state1['joinCode'] as string;
    await c1.waitFor('state_snapshot'); // consume first joiner snapshot

    c1.send({ type: 'signal_write', signalPath: 'Cell/Start', value: true });
    c1.send({ type: 'signal_write', signalPath: 'Speed', value: 42.5 });
    c1.send({ type: 'drive_jog', drivePath: 'Conveyor/Drive', forward: true });

    // Brief pause for server to process all writes before late joiner arrives
    await new Promise(r => setTimeout(r, 50));

    const c2 = await TestClient.connect(url);
    c2.send({ type: 'room_join', name: 'Late', color: '#00FF00', role: 'observer', joinCode });

    await c2.waitFor('room_state');
    const snapshot = await c2.waitFor('state_snapshot');

    expect(snapshot['type']).toBe('state_snapshot');
    const signals = snapshot['signals'] as Array<Record<string, unknown>>;
    const drives = snapshot['drives'] as Array<Record<string, unknown>>;

    expect(signals.length).toBeGreaterThanOrEqual(2);
    const startSig = signals.find(s => s['path'] === 'Cell/Start');
    const speedSig = signals.find(s => s['path'] === 'Speed');
    expect(startSig?.['value']).toBe(true);
    expect(speedSig?.['value']).toBeCloseTo(42.5);

    expect(drives.length).toBeGreaterThanOrEqual(1);
    expect(drives.find(d => d['path'] === 'Conveyor/Drive')).toBeDefined();

    const players = snapshot['players'] as Array<Record<string, unknown>>;
    expect(players.some(p => p['name'] === 'First')).toBe(true);

    c1.close();
    c2.close();
  });

  // ── Disconnect cleanup ──

  it('client disconnect broadcasts room_leave to remaining clients', async () => {
    const c1 = await TestClient.connect(url);
    c1.send({ type: 'room_join', name: 'Alice', color: '#FF0000', role: 'operator' });
    const state1 = await c1.waitFor('room_state');
    const joinCode = state1['joinCode'] as string;

    const c2 = await TestClient.connect(url);
    c2.send({ type: 'room_join', name: 'Bob', color: '#00FF00', role: 'observer', joinCode });

    // Wait for 2-player room_state on both sides
    const [twoPlayerState] = await Promise.all([c1.waitFor('room_state'), c2.waitFor('room_state')]);
    const aliceId = (twoPlayerState['players'] as Array<Record<string, unknown>>)
      .find(p => p['name'] === 'Alice')?.['id'] as string;

    // Alice disconnects
    c1.close();
    await c1.closed;

    // Bob receives room_leave
    const leave = await c2.waitFor('room_leave');
    expect(leave['type']).toBe('room_leave');
    expect(leave['id']).toBe(aliceId);

    c2.close();
  });

  it('explicit room_leave broadcasts to remaining clients', async () => {
    const c1 = await TestClient.connect(url);
    c1.send({ type: 'room_join', name: 'Alice', color: '#FF0000', role: 'operator' });
    const state1 = await c1.waitFor('room_state');
    const joinCode = state1['joinCode'] as string;
    await c1.waitFor('state_snapshot');

    const c2 = await TestClient.connect(url);
    c2.send({ type: 'room_join', name: 'Bob', color: '#00FF00', role: 'observer', joinCode });
    await Promise.all([c1.waitFor('room_state'), c2.waitFor('room_state')]);

    // Alice sends explicit room_leave
    c1.send({ type: 'room_leave' });

    const leave = await c2.waitFor('room_leave');
    expect(leave['type']).toBe('room_leave');
    expect(leave['id']).toBeTruthy();

    c1.close();
    c2.close();
  });

  // ── Multiple rooms isolation ──

  it('signals in one room do not leak into another room', async () => {
    // Room A
    const cA = await TestClient.connect(url);
    cA.send({ type: 'room_join', name: 'A1', color: '#FF0000', role: 'operator' });
    const stateA = await cA.waitFor('room_state');
    const codeA = stateA['joinCode'] as string;
    await cA.waitFor('state_snapshot');

    // Room B — separate room (no joinCode → new room)
    const cB = await TestClient.connect(url);
    cB.send({ type: 'room_join', name: 'B1', color: '#00FF00', role: 'operator' });
    const stateB = await cB.waitFor('room_state');
    const codeB = stateB['joinCode'] as string;
    await cB.waitFor('state_snapshot');

    expect(codeA).not.toBe(codeB);

    // A1 writes a signal in Room A
    cA.send({ type: 'signal_write', signalPath: 'RoomA/Signal', value: 99 });
    await new Promise(r => setTimeout(r, 50));

    // Add a second client to Room B — their state_snapshot must NOT contain RoomA/Signal
    const cB2 = await TestClient.connect(url);
    cB2.send({ type: 'room_join', name: 'B2', color: '#0000FF', role: 'observer', joinCode: codeB });
    await Promise.all([cB.waitFor('room_state'), cB2.waitFor('room_state')]);
    const snapshotB2 = await cB2.waitFor('state_snapshot');

    const signalsB = (snapshotB2['signals'] as Array<Record<string, unknown>>) ?? [];
    expect(signalsB.find(s => s['path'] === 'RoomA/Signal')).toBeUndefined();

    // B1 should not have received a signal_write from Room A
    const b1msgs = await cB.collect(100);
    expect(b1msgs.filter(m => m['type'] === 'signal_write')).toHaveLength(0);

    cA.close();
    cB.close();
    cB2.close();
  });

  it('room_leave only affects the room the client is in', async () => {
    // Room A with two clients
    const cA1 = await TestClient.connect(url);
    cA1.send({ type: 'room_join', name: 'A1', color: '#FF0000', role: 'operator' });
    const stateA1 = await cA1.waitFor('room_state');
    const codeA = stateA1['joinCode'] as string;

    const cA2 = await TestClient.connect(url);
    cA2.send({ type: 'room_join', name: 'A2', color: '#FFAA00', role: 'observer', joinCode: codeA });
    await Promise.all([cA1.waitFor('room_state'), cA2.waitFor('room_state')]);

    // Room B with one client
    const cB1 = await TestClient.connect(url);
    cB1.send({ type: 'room_join', name: 'B1', color: '#00FF00', role: 'operator' });
    await cB1.waitFor('room_state');

    // A1 disconnects
    cA1.close();
    await cA1.closed;

    // A2 receives room_leave
    const leave = await cA2.waitFor('room_leave');
    expect(leave['type']).toBe('room_leave');

    // B1 should receive nothing
    const b1msgs = await cB1.collect(150);
    expect(b1msgs.filter(m => m['type'] === 'room_leave')).toHaveLength(0);

    cA2.close();
    cB1.close();
  });

  // ── Cursor ray ──

  it('cursor_ray is relayed to other clients without being stored in state_snapshot', async () => {
    const c1 = await TestClient.connect(url);
    c1.send({ type: 'room_join', name: 'Alice', color: '#FF0000', role: 'operator' });
    const state1 = await c1.waitFor('room_state');
    const joinCode = state1['joinCode'] as string;
    await c1.waitFor('state_snapshot');

    const c2 = await TestClient.connect(url);
    c2.send({ type: 'room_join', name: 'Bob', color: '#00FF00', role: 'observer', joinCode });
    await Promise.all([c1.waitFor('room_state'), c2.waitFor('room_state')]);

    // Alice sends a cursor ray
    c1.send({ type: 'cursor_ray', origin: [1, 1, 1], direction: [0, -1, 0] });

    // Bob receives it
    const ray = await c2.waitFor('cursor_ray');
    expect(ray['type']).toBe('cursor_ray');
    expect(ray['origin']).toEqual([1, 1, 1]);
    expect(ray['direction']).toEqual([0, -1, 0]);
    expect(ray['id']).toBeTruthy();

    // Late joiner's state_snapshot must NOT contain cursor_ray data in signals
    const c3 = await TestClient.connect(url);
    c3.send({ type: 'room_join', name: 'Charlie', color: '#0000FF', role: 'observer', joinCode });
    await c3.waitFor('room_state');
    const snapshot = await c3.waitFor('state_snapshot');

    const signals = (snapshot['signals'] as unknown[]) ?? [];
    // cursor_ray is ephemeral and must not appear in snapshot signals
    expect(signals.some(s => (s as Record<string, unknown>)['type'] === 'cursor_ray')).toBe(false);

    c1.close();
    c2.close();
    c3.close();
  });

  // ── Protocol error handling ──

  it('sending message without room_join returns error not_joined', async () => {
    const c = await TestClient.connect(url);
    c.send({ type: 'avatar_update', headPos: [0, 0, 0] });
    const err = await c.waitFor('error');
    expect(err['code']).toBe('not_joined');
    c.close();
  });

  it('sending non-JSON returns error invalid_json', async () => {
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const w = new WebSocket(url);
      w.once('open', () => resolve(w));
      w.once('error', reject);
    });
    const c = new TestClient(ws);
    ws.send('not json at all!!!');
    const err = await c.waitFor('error');
    expect(err['code']).toBe('invalid_json');
    c.close();
  });

  it('invalid join code returns error invalid_join_code', async () => {
    const c = await TestClient.connect(url);
    c.send({ type: 'room_join', name: 'Alice', joinCode: 'BAD!!' });
    const err = await c.waitFor('error');
    expect(err['code']).toBe('invalid_join_code');
    c.close();
  });

  // ── Health endpoint ──

  it('HTTP GET /health returns 200 with status ok', async () => {
    const res = await fetch(`${httpUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['status']).toBe('ok');
  });

  // ── State snapshot includes existing players for late joiners ──

  it('state_snapshot players list includes existing players in room', async () => {
    const c1 = await TestClient.connect(url);
    c1.send({ type: 'room_join', name: 'Alice', color: '#FF0000', role: 'operator' });
    const state1 = await c1.waitFor('room_state');
    const joinCode = state1['joinCode'] as string;
    await c1.waitFor('state_snapshot');

    const c2 = await TestClient.connect(url);
    c2.send({ type: 'room_join', name: 'Bob', color: '#00FF00', role: 'observer', joinCode });
    await Promise.all([c1.waitFor('room_state'), c2.waitFor('room_state')]);

    // Third client joins late
    const c3 = await TestClient.connect(url);
    c3.send({ type: 'room_join', name: 'Charlie', color: '#0000FF', role: 'observer', joinCode });
    await c3.waitFor('room_state');
    const snapshot = await c3.waitFor('state_snapshot');

    const players = snapshot['players'] as Array<Record<string, unknown>>;
    const names = players.map(p => p['name']);
    expect(names).toContain('Alice');
    expect(names).toContain('Bob');

    c1.close();
    c2.close();
    c3.close();
  });
});
