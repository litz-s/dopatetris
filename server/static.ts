import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST_DIR = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function setSecurityHeaders(res: ServerResponse): void {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('x-robots-tag', 'noindex, nofollow, noarchive');
  res.setHeader(
    'content-security-policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' https://fonts.googleapis.com",
      'font-src https://fonts.gstatic.com',
      "connect-src 'self' ws: wss:",
      "img-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
}

function safeFilePath(pathname: string): string | null {
  const candidate = resolve(DIST_DIR, `.${pathname}`);
  if (candidate === DIST_DIR || candidate.startsWith(`${DIST_DIR}${sep}`)) return candidate;
  return null;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** GET/HEADをdistから返す。対象メソッドなら常にtrue。 */
export async function serveApp(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  setSecurityHeaders(res);

  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return true;
  }

  const requested = pathname === '/' ? '/index.html' : pathname;
  const candidate = safeFilePath(requested);
  if (candidate === null) {
    res.writeHead(400);
    res.end('Bad Request');
    return true;
  }

  let filePath = candidate;
  if (!(await isFile(filePath))) {
    // 拡張子のない画面URLだけSPAの入口へ戻す。存在しないassetは404にする。
    if (extname(pathname) !== '') {
      res.writeHead(404);
      res.end('Not Found');
      return true;
    }
    filePath = resolve(DIST_DIR, 'index.html');
  }

  const extension = extname(filePath).toLowerCase();
  res.setHeader('content-type', CONTENT_TYPES[extension] ?? 'application/octet-stream');
  if (requested.startsWith('/assets/')) {
    res.setHeader('cache-control', 'public, max-age=31536000, immutable');
  } else {
    res.setHeader('cache-control', 'no-cache');
  }

  res.writeHead(200);
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }

  createReadStream(filePath)
    .on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    })
    .pipe(res);
  return true;
}
