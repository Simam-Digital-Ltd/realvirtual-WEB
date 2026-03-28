/**
 * server.ts — Entry point for the realvirtual WebViewer relay server.
 *
 * Starts a combined HTTP + WebSocket server on a single port:
 *   - HTTP GET /model.glb  → Serves the GLB file specified by --model
 *   - HTTP GET /health     → Returns 200 { status: "ok", rooms, clients }
 *   - WebSocket ws://      → Handles rv WS v2 + Presence protocol (port 7000 default)
 *
 * CLI arguments:
 *   --port <number>   WebSocket and HTTP port (default: 7000)
 *   --model <path>    Path to a GLB file to serve (optional)
 *
 * Usage:
 *   node dist/server.js --port 7000 --model ./public/model.glb
 *   npx tsx src/server.ts --dev
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { RoomManager } from './room-manager.js';
import { ProtocolHandler } from './protocol-handler.js';

// ── CLI argument parsing ──────────────────────────────────────────────────────

interface ServerOptions {
  port: number;
  modelPath: string | null;
}

function parseArgs(argv: string[]): ServerOptions {
  const options: ServerOptions = { port: 7000, modelPath: null };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' && i + 1 < argv.length) {
      const p = parseInt(argv[++i], 10);
      if (!isNaN(p) && p > 0 && p < 65536) options.port = p;
    } else if (arg === '--model' && i + 1 < argv.length) {
      options.modelPath = argv[++i];
    }
  }

  return options;
}

// ── Main server startup ───────────────────────────────────────────────────────

export function createServer(options: ServerOptions): {
  httpServer: http.Server;
  wss: WebSocketServer;
  rooms: RoomManager;
} {
  const rooms = new RoomManager();
  const handler = new ProtocolHandler(rooms);

  // ── Express HTTP application ──

  const app = express();

  // Health check endpoint
  app.get('/health', (_req, res) => {
    let totalClients = 0;
    for (const code of rooms.roomCodes) {
      const room = rooms.getRoom(code);
      if (room) totalClients += room.clients.size;
    }
    res.json({
      status: 'ok',
      rooms: rooms.roomCount,
      clients: totalClients,
    });
  });

  // GLB model serving
  if (options.modelPath) {
    const resolvedModelPath = path.resolve(options.modelPath);
    if (!fs.existsSync(resolvedModelPath)) {
      console.warn(`[relay] WARNING: model file not found at ${resolvedModelPath}`);
    } else {
      app.get('/model.glb', (_req, res) => {
        res.setHeader('Content-Type', 'model/gltf-binary');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.sendFile(resolvedModelPath);
      });
      console.log(`[relay] Serving model at /model.glb from ${resolvedModelPath}`);
    }
  }

  // Catch-all 404
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // ── HTTP server (shared with WebSocket) ──

  const httpServer = http.createServer(app);

  // ── WebSocket server ──

  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    handler.onConnect(ws);
  });

  wss.on('error', (err) => {
    console.error('[relay] WebSocketServer error:', err.message);
  });

  return { httpServer, wss, rooms };
}

// ── Bootstrap (only when run directly, not when imported by tests) ────────────

// Detect if this file is the entry point
const isMain = process.argv[1] && (
  process.argv[1].endsWith('server.ts') ||
  process.argv[1].endsWith('server.js')
);

if (isMain) {
  const options = parseArgs(process.argv.slice(2));
  const { httpServer } = createServer(options);

  httpServer.listen(options.port, () => {
    console.log(`[relay] realvirtual relay server listening on port ${options.port}`);
    if (options.modelPath) {
      console.log(`[relay] GLB model: GET http://localhost:${options.port}/model.glb`);
    }
    console.log(`[relay] Health:    GET http://localhost:${options.port}/health`);
    console.log(`[relay] WebSocket: ws://localhost:${options.port}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[relay] SIGTERM received, shutting down gracefully...');
    httpServer.close(() => {
      console.log('[relay] Server closed.');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('[relay] SIGINT received, shutting down...');
    httpServer.close(() => process.exit(0));
  });
}
