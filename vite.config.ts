import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site under /<repo>/. The workflow passes that
// sub-path as BASE_PATH; local development runs at the root.
function basePath(): string {
  const raw = process.env.BASE_PATH?.trim();
  if (!raw) return '/';
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

/**
 * Content Security Policy for the published build. The page may only talk to
 * itself and to the FOLIA API origin; photos and previews are blob: URLs.
 * GitHub Pages cannot send headers, so the policy travels as a meta tag
 * (frame-ancestors is not available that way).
 */
function contentSecurityPolicy(apiBase: string): Plugin {
  let apiOrigin = '';
  try {
    apiOrigin = apiBase ? new URL(apiBase).origin : '';
  } catch {
    throw new Error(`VITE_API_BASE_URL is not a valid URL: ${apiBase}`);
  }
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'folia-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiBase = (process.env.VITE_API_BASE_URL ?? env.VITE_API_BASE_URL ?? '').trim();
  return {
    base: basePath(),
    plugins: [react(), contentSecurityPolicy(apiBase)],
    build: {
      outDir: 'dist',
      sourcemap: false,
      assetsInlineLimit: 0,
    },
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
  };
});
