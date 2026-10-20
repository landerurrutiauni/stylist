import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** Synthetic photos (drawings, not people) are generated once with sharp. */
export default function globalSetup() {
  if (!existsSync('tests/fixtures/generated/with-exif.jpg')) {
    execFileSync(process.execPath, ['scripts/make-fixtures.mjs'], { stdio: 'inherit' });
  }
}
