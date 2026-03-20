import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
// PWA disabled – always serve fresh content, no service worker caching
// import { VitePWA } from 'vite-plugin-pwa';
import { playwright } from '@vitest/browser-playwright';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { exec } from 'node:child_process';

/** Vite plugin: exposes /__api/tests endpoints so the app can discover and run vitest tests */
function testRunnerPlugin() {
  return {
    name: 'rv-test-runner',
    apply: 'serve' as const,
    configureServer(server: { config: { root: string }; middlewares: { use: Function } }) {
      server.middlewares.use((req: { url?: string; method?: string }, res: any, next: Function) => {
        if (req.url === '/__api/tests') {
          const testsDir = join(server.config.root, 'tests');
          let files: string[] = [];
          if (existsSync(testsDir)) {
            files = readdirSync(testsDir)
              .filter((f: string) => f.endsWith('.test.ts'))
              .map((f: string) => `tests/${f}`);
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ files }));
          return;
        }

        if (req.url === '/__api/tests/run' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          exec('npx vitest run --reporter=json', {
            cwd: server.config.root,
            maxBuffer: 10 * 1024 * 1024,
            timeout: 180000,
          }, (_err: unknown, stdout: string) => {
            try {
              const jsonStart = stdout.indexOf('{');
              const jsonEnd = stdout.lastIndexOf('}');
              if (jsonStart >= 0 && jsonEnd > jsonStart) {
                const json = JSON.parse(stdout.substring(jsonStart, jsonEnd + 1));
                res.end(JSON.stringify(json));
              } else {
                res.end(JSON.stringify({ error: 'No JSON output from vitest' }));
              }
            } catch (e) {
              res.end(JSON.stringify({ error: String(e) }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

/** Vite plugin: debug API — bidirectional bridge between browser and Claude Code.
 *
 * READ:  Browser pushes state snapshots via POST, Claude Code reads via GET.
 * WRITE: Claude Code pushes commands via POST, browser polls and executes them.
 * Also buffers errors and signal changelogs pushed from the browser.
 */
function debugApiPlugin() {
  let latestSnapshot = '{"status":"no data yet"}';
  let cmdIdCounter = 0;
  const cmdQueue: { id: number; cmd: string; [k: string]: unknown }[] = [];
  const cmdResults: { id: number; success: boolean; error?: string }[] = [];

  function readBody(req: { on: Function }): Promise<string> {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', (chunk: string) => { body += chunk; });
      req.on('end', () => resolve(body));
    });
  }

  function json(res: any, data: unknown, status = 200) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(status);
    res.end(JSON.stringify(data));
  }

  return {
    name: 'rv-debug-api',
    apply: 'serve' as const,
    configureServer(server: { middlewares: { use: Function } }) {
      server.middlewares.use(async (req: { url?: string; method?: string; on: Function }, res: any, next: Function) => {
        const url = req.url ?? '';

        // ── Snapshot push/read ──

        if (url === '/__api/debug/snapshot' && req.method === 'POST') {
          latestSnapshot = await readBody(req);
          res.writeHead(200); res.end('ok');
          return;
        }

        // ── Command queue: Claude Code → Browser ──

        // POST /__api/debug/cmd — Claude Code pushes a command
        if (url === '/__api/debug/cmd' && req.method === 'POST') {
          const body = JSON.parse(await readBody(req));
          const id = ++cmdIdCounter;
          cmdQueue.push({ id, ...body });
          json(res, { queued: true, id });
          return;
        }

        // GET /__api/debug/cmd/poll — Browser polls for pending commands
        if (url === '/__api/debug/cmd/poll' && req.method === 'GET') {
          const commands = cmdQueue.splice(0);
          json(res, { commands });
          return;
        }

        // POST /__api/debug/cmd/result — Browser posts execution result
        if (url === '/__api/debug/cmd/result' && req.method === 'POST') {
          const result = JSON.parse(await readBody(req));
          cmdResults.push(result);
          if (cmdResults.length > 100) cmdResults.splice(0, cmdResults.length - 100);
          res.writeHead(200); res.end('ok');
          return;
        }

        // GET /__api/debug/cmd/results — Claude Code reads results
        if (url === '/__api/debug/cmd/results' && req.method === 'GET') {
          const results = cmdResults.splice(0);
          json(res, { results });
          return;
        }

        // ── GET /__api/debug[/sub] — serve snapshot or sub-route ──

        if (url.startsWith('/__api/debug') && req.method === 'GET') {
          const fullRoute = url.replace('/__api/debug', '') || '/';
          // Split route from query string
          const qIdx = fullRoute.indexOf('?');
          const route = qIdx >= 0 ? fullRoute.slice(0, qIdx) : fullRoute;
          const query = qIdx >= 0 ? new URLSearchParams(fullRoute.slice(qIdx)) : null;

          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');

          if (route === '/' || route === '/snapshot') {
            res.end(latestSnapshot);
            return;
          }

          try {
            const data = JSON.parse(latestSnapshot);
            const sub = route.slice(1); // strip leading '/'

            // Signal watch: /__api/debug/signals?names=A,B,C
            if (sub === 'signals' && query?.get('names')) {
              const names = query.get('names')!.split(',');
              const filtered: Record<string, unknown> = {};
              for (const n of names) {
                if (n in (data.signals ?? {})) filtered[n] = data.signals[n];
              }
              json(res, filtered);
              return;
            }

            if (sub in data) {
              json(res, data[sub]);
              return;
            }
          } catch { /* snapshot not valid JSON yet */ }

          json(res, { error: 'unknown route' }, 404);
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE || './',
  plugins: [
    react(),
    // VitePWA disabled – no service worker, always fresh content
    testRunnerPlugin(),
    debugApiPlugin(),
  ],
  server: {
    open: true,
    https: !!process.env.HTTPS,
    headers: {
      'Cache-Control': 'no-store',
    },
    watch: {
      usePolling: true,
      interval: 100,
    },
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          echarts: ['echarts'],
          rapier: ['@dimforge/rapier3d-compat'],
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
