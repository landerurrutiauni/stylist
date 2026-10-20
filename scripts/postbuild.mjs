// Runs after `vite build`. GitHub Pages serves 404.html for any path it does
// not know, with a 404 status; making it a copy of index.html lets the app
// load on a direct visit or reload of an internal route (/stylist/privacidad)
// and render the right screen, without redirects. `.nojekyll` stops Pages from
// running Jekyll over the output.
import { copyFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? 'dist');
await access(path.join(dir, 'index.html'));
await copyFile(path.join(dir, 'index.html'), path.join(dir, '404.html'));
await writeFile(path.join(dir, '.nojekyll'), '');
console.log(`postbuild: 404.html and .nojekyll written to ${dir}`);
