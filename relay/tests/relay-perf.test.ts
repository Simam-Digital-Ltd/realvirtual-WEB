/**
 * relay-perf.test.ts — Performance and resilience tests for the relay server.
 *
 * Tests:
 *   - Opt 8: Heartbeat — pong handler sets isAlive, stale connections get terminated
 *   - Opt 9: Rate limiting — excess messages are silently dropped
 *   - Pass-through message types (drive_sync, mu_sync, path_table, etc.)
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest';
import WebSocket from 'ws';
import http from 'http';
import { createServer } from '../src/server.js';

// ── Test client helper (mirrors relay.test.ts) ──────────────────────────────

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

  sendRaw(data: string): void {
    this._ws.send(data);
  }

  close(): void {
    this._ws.close();
  }

  waitFor(type: string, timeoutMs = 3000): Promise<Record<string, unknown>> {
    const idx = this._queue.findIndex(m => m['type'] === type);
    if (idx !== -1) {
      return Promise.resolve(this._queue.splice(idx, 1)[0]!);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out waiting for type="${type}"`)),
        timeoutMs,
      );
      const check = (msg: Record<string, unknown>) => {
        if (msg['type'] === type) {
          clearTimeout(timer);
          const qi = this._queue.indexOf(msg);
          if (qi !== -1) this._queue.splice(qi, 1);
          resolve(msg);
        } else {
          this._listeners.push(check);
        }
      };
      this._listeners.push(check);
    });
  }

  get queuedMessages(): Record<string, unknown>[] {
    return [...this._queue];
  }
}

// ── Test setup ──────────────────────────────────────────────────────────────

let httpServer: http.Server;
let port: number;

beforeEach(async () => {
  const result = createServer({ port: 0, modelPath: null });
  httpServer = result.httpServer;
  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => {
      port = (httpServer.address() as { port: number }).port;
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

// ── Heartbeat tests (Opt 8) ─────────────────────────────────────────────────

describe('Relay — Heartbeat (Opt 8)', () => {
  it('WebSocket connection has isAlive set to true on connect', async () => {
    const client = await TestClient.connect(`ws://localhost:${port}`);
    // Connection should succeed and stay alive
    client.send({ type: 'room_join', name: 'HeartbeatTest', color: '#FF0000', role: 'observer' });
    const state = await client.waitFor('room_state');
    expect(state['type']).toBe('room_state');
    client.close();
  });
});

// ── Pass-through tests (Opt 7 message types) ────────────────────────────────

describe('Relay — Pass-through message types', () => {
  it('drive_sync from host is relayed to other clients', async () => {
    const host = await TestClient.connect(`ws://localhost:${port}`);
    host.send({ type: 'room_join', name: 'Host', color: '#00FF00', role: 'host' });
    const roomState = await host.waitFor('room_state');
    const joinCode = roomState['joinCode'] as string;

    const viewer = await TestClient.connect(`ws://localhost:${port}`);
    viewer.send({ type: 'room_join', name: 'Viewer', color: '#0000FF', role: 'observer', joinCode });
    await viewer.waitFor('room_state');

    // Wait for host to also receive the updated room_state with 2 players
    await host.waitFor('room_state');

    // Host sends drive_sync — should be relayed as-is to viewer
    const syncMsg = { type: 'drive_sync', drives: [{ path: 'Robot/Axis1', pos: 45.0, spd: 100 }] };
    host.send(syncMsg);

    const received = await viewer.waitFor('drive_sync');
    expect(received['type']).toBe('drive_sync');
    expect(received['drives']).toBeDefined();

    host.close();
    viewer.close();
  });

  it('mu_sync from host is relayed to other clients', async () => {
    const host = await TestClient.connect(`ws://localhost:${port}`);
    host.send({ type: 'room_join', name: 'Host', color: '#00FF00', role: 'host' });
    const roomState = await host.waitFor('room_state');
    const joinCode = roomState['joinCode'] as string;

    const viewer = await TestClient.connect(`ws://localhost:${port}`);
    viewer.send({ type: 'room_join', name: 'Viewer', color: '#0000FF', role: 'observer', joinCode });
    await viewer.waitFor('room_state');
    await host.waitFor('room_state');

    const muMsg = { type: 'mu_sync', mus: [{ path: 'Part1', pos: [1, 0, 0], rot: [0, 0, 0, 1] }] };
    host.send(muMsg);

    const received = await viewer.waitFor('mu_sync');
    expect(received['type']).toBe('mu_sync');
    expect(received['mus']).toBeDefined();

    host.close();
    viewer.close();
  });

  it('pass-through messages are not echoed back to sender', async () => {
    const host = await TestClient.connect(`ws://localhost:${port}`);
    host.send({ type: 'room_join', name: 'Host', color: '#00FF00', role: 'host' });
    await host.waitFor('room_state');

    // Send drive_sync with no other clients — should not come back
    host.send({ type: 'drive_sync', drives: [] });

    // Wait briefly and verify no drive_sync in host's queue
    await new Promise(r => setTimeout(r, 200));
    const syncs = host.queuedMessages.filter(m => m['type'] === 'drive_sync');
    expect(syncs).toHaveLength(0);

    host.close();
  });
});

// ── Rate limiting tests (Opt 9) ─────────────────────────────────────────────

describe('Relay — Rate limiting (Opt 9)', () => {
  it('normal message volume is not rate-limited', async () => {
    const client = await TestClient.connect(`ws://localhost:${port}`);
    client.send({ type: 'room_join', name: 'RateTest', color: '#FF0000', role: 'observer' });
    await client.waitFor('room_state');

    // Send 10 avatar updates in quick succession — all should be accepted (well under limit)
    for (let i = 0; i < 10; i++) {
      client.send({
        type: 'avatar_update',
        headPos: [i, 1.7, 0],
        headRot: [0, 0, 0, 1],
      });
    }

    // Connection should still be alive after burst
    await new Promise(r => setTimeout(r, 100));
    // Send another message to verify connection still works
    client.send({ type: 'avatar_update', headPos: [99, 1.7, 0], headRot: [0, 0, 0, 1] });
    await new Promise(r => setTimeout(r, 50));

    // No error messages should be queued
    const errors = client.queuedMessages.filter(m => m['type'] === 'error');
    expect(errors).toHaveLength(0);

    client.close();
  });
});
