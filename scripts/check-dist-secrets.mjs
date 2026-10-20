// Fails if anything in the published folder looks like a credential, or if a
// server-only variable name leaked into the bundle. Run after every build.
//   node scripts/check-dist-secrets.mjs [dir]
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? 'dist');

const PATTERNS = [
  [/sk-ant-[A-Za-z0-9_-]{10,}/, 'Anthropic API key'],
  [/AIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
  [/sb_secret_[A-Za-z0-9_-]{10,}/, 'Supabase secret key'],
  [/eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, 'JWT (service role?)'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/, 'GitHub token'],
  [/ANTHROPIC_API_KEY|GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|RATE_LIMIT_SALT/, 'server-only variable name'],
];

// Values of real secrets present in this environment must never appear either.
const LIVE = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'RATE_LIMIT_SALT']
  .map((name) => process.env[name])
  .filter((value) => value && value.length >= 8);

async function* walk(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const problems = [];
let files = 0;
for await (const file of walk(dir)) {
  if (/\.(woff2?|png|jpe?g|webp|ico)$/.test(file)) continue;
  files += 1;
  const text = await readFile(file, 'utf8');
  for (const [pattern, label] of PATTERNS) if (pattern.test(text)) problems.push(`${path.relative(dir, file)}: ${label}`);
  for (const value of LIVE) if (text.includes(value)) problems.push(`${path.relative(dir, file)}: contains a live secret value`);
  if (/(^|\/)\.env/.test(file)) problems.push(`${path.relative(dir, file)}: .env file published`);
}

if (problems.length) {
  console.error(`Secret scan FAILED in ${dir}:\n${problems.map((line) => `  - ${line}`).join('\n')}`);
  process.exit(1);
}
console.log(`Secret scan passed: ${files} text files in ${dir}, no credentials found.`);
