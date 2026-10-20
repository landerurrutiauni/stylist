// Synthetic test photos: flat drawings of a face, not people. Used by the
// end-to-end tests and for visual review. Output: tests/fixtures/generated/.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const out = path.resolve('tests/fixtures/generated');
await mkdir(out, { recursive: true });

const frontal = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500">
  <rect width="1200" height="1500" fill="#cfd6dc"/>
  <rect y="1100" width="1200" height="400" fill="#4b5a66"/>
  <path d="M420 1150 Q600 1050 780 1150 L900 1500 L300 1500 Z" fill="#2f3b45"/>
  <rect x="520" y="900" width="160" height="260" fill="#c99a7c"/>
  <ellipse cx="600" cy="640" rx="250" ry="330" fill="#d9a988"/>
  <path d="M340 600 Q330 260 600 250 Q870 260 860 600 Q820 420 600 400 Q380 420 340 600 Z" fill="#3a2a20"/>
  <ellipse cx="510" cy="620" rx="34" ry="18" fill="#3b2b22"/>
  <ellipse cx="690" cy="620" rx="34" ry="18" fill="#3b2b22"/>
  <path d="M600 640 L580 760 L620 760 Z" fill="#c08d6d"/>
  <path d="M530 840 Q600 880 670 840" stroke="#8c4f43" stroke-width="14" fill="none"/>
</svg>`;

const profile = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500">
  <rect width="1200" height="1500" fill="#cfd6dc"/>
  <rect y="1100" width="1200" height="400" fill="#4b5a66"/>
  <path d="M420 1150 Q600 1050 820 1150 L940 1500 L300 1500 Z" fill="#2f3b45"/>
  <rect x="560" y="900" width="170" height="260" fill="#c99a7c"/>
  <path d="M470 380 Q600 250 760 300 Q880 380 860 620 Q850 820 740 930 Q650 980 560 950 Q520 880 470 840 Q450 780 470 760 Q440 740 455 700 Q420 690 410 660 Q440 600 450 560 Q440 460 470 380 Z" fill="#d9a988"/>
  <path d="M460 420 Q560 240 760 290 Q900 360 870 640 Q840 560 760 520 Q660 470 560 430 Z" fill="#3a2a20"/>
  <ellipse cx="700" cy="640" rx="30" ry="50" fill="#c08d6d"/>
</svg>`;

async function render(svg, file, transform = (image) => image) {
  await transform(sharp(Buffer.from(svg)))
    .jpeg({ quality: 88 })
    .toFile(path.join(out, file));
}

await render(frontal, 'frontal.jpg');
await render(profile, 'profile.jpg');
await render(frontal, 'dark.jpg', (image) => image.modulate({ brightness: 0.12 }));
await render(frontal, 'blurry.jpg', (image) => image.blur(28));
await sharp(Buffer.from(frontal)).webp({ quality: 85 }).toFile(path.join(out, 'frontal.webp'));
await sharp(Buffer.from(profile)).png().toFile(path.join(out, 'profile.png'));
await sharp(Buffer.from(frontal)).resize(300, 375).jpeg().toFile(path.join(out, 'small.jpg'));
// A PNG with EXIF-like metadata is enough to prove re-encoding strips it.
await sharp(Buffer.from(frontal))
  .withMetadata({ exif: { IFD0: { Copyright: 'FOLIA test', Artist: 'Fixture' } } })
  .jpeg()
  .toFile(path.join(out, 'with-exif.jpg'));
console.log('fixtures written to', out);
