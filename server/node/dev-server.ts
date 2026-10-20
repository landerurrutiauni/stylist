import { createServer, type IncomingMessage } from 'node:http';
import { existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { createHandler } from '../core/handler.ts';

/**
 * Local API for development: `npm run dev:api`. Reads `.env` when present and
 * serves the same handler the edge function uses, at http://localhost:8787.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

const port = Number(process.env.PORT ?? 8787);
const env: Record<string, string | undefined> = {
  ...process.env,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:4173',
};

const handle = createHandler({
  env,
  log: (entry) => console.log(JSON.stringify({ at: new Date().toISOString(), ...entry })),
});

function toRequest(req: IncomingMessage): Request {
  const url = `http://${req.headers.host ?? `localhost:${port}`}${req.url ?? '/'}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else if (value !== undefined) headers.set(key, value);
  }
  headers.set('x-forwarded-for', req.socket.remoteAddress ?? 'local');
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    // Required by Node's fetch implementation for streamed request bodies.
    ...(hasBody ? { duplex: 'half' } : {}),
  } as RequestInit);
}

createServer(async (req, res) => {
  try {
    const response = await handle(toRequest(req));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (!response.body) {
      res.end();
      return;
    }
    const reader = response.body.getReader();
    req.on('close', () => void reader.cancel().catch(() => {}));
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'request failed');
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ type: 'error', code: 'internal', message: 'Error interno.', retryable: true }));
  }
}).listen(port, () => {
  const key = env.ANTHROPIC_API_KEY ? 'configurada' : 'sin configurar (el análisis real responderá 503)';
  const images = env.GEMINI_API_KEY ? 'configurada' : 'sin configurar (la vista previa responderá 503)';
  console.log(`FOLIA API en http://localhost:${port} · clave de Anthropic ${key} · clave de Gemini ${images}`);
});
