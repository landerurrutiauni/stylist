// A small static server that behaves like GitHub Pages for a project site:
// files are served under /<repo>/, unknown paths get 404.html with status 404,
// and nothing outside the base path exists. Used by the end-to-end tests.
//   node scripts/pages-server.mjs --dir dist --base /stylist/ --port 4321
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith('--') ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []),
);
const root = path.resolve(args.dir ?? 'dist');
const base = (args.base ?? '/stylist/').replace(/\/?$/, '/');
const port = Number(args.port ?? 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

async function file(target) {
  try {
    const info = await stat(target);
    if (info.isDirectory()) return file(path.join(target, 'index.html'));
    return { body: await readFile(target), type: TYPES[path.extname(target)] ?? 'application/octet-stream' };
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let found = null;
  if (url.pathname.startsWith(base) || url.pathname === base.slice(0, -1)) {
    const relative = decodeURIComponent(url.pathname.slice(base.length));
    const target = path.normalize(path.join(root, relative));
    if (target.startsWith(root)) found = await file(target);
  }
  if (found) {
    res.writeHead(200, { 'Content-Type': found.type });
    res.end(found.body);
    return;
  }
  const notFound = url.pathname.startsWith(base) ? await file(path.join(root, '404.html')) : null;
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(notFound?.body ?? 'Not found');
}).listen(port, () => console.log(`GitHub Pages simulator: http://localhost:${port}${base} -> ${root}`));
