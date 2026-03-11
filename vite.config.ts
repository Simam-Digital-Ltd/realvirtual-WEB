import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
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

export default defineConfig({
  base: './',
  plugins: [react(), testRunnerPlugin()],
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
    outDir: 'dist',
    sourcemap: true,
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
