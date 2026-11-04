// Deployment guard: DSH metadata accepts a package-local SVG/PNG/JPEG/WebP
// whose raw file bytes are at most 256 KiB (not the archive's compressed size).
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep, win32 } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MAX_ICON_BYTES = 256 * 1024;
export const ICON_MEDIA_TYPES = new Map([
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'],
]);

export async function checkIcon(manifestPath = new URL('../package.json', import.meta.url)) {
  const manifest = manifestPath instanceof URL ? fileURLToPath(manifestPath) : resolve(manifestPath);
  const pkg = JSON.parse(await readFile(manifest, 'utf8'));
  const icon = pkg.icon;
  if (typeof icon !== 'string' || !icon.trim() || isAbsolute(icon) || win32.isAbsolute(icon) || /^[A-Za-z][A-Za-z\d+.-]*:/u.test(icon)) {
    throw new Error('Plugin icon must be a relative file path');
  }
  const root = await realpath(dirname(manifest));
  const file = await realpath(resolve(root, icon));
  const local = relative(root, file);
  if (local === '..' || local.startsWith('..' + sep) || isAbsolute(local)) throw new Error('Plugin icon must remain inside its package directory');
  const mediaType = ICON_MEDIA_TYPES.get(extname(icon).toLowerCase());
  if (!mediaType) throw new Error('Plugin icon must be SVG, PNG, JPEG, or WebP');
  const info = await stat(file);
  if (!info.isFile()) throw new Error('Plugin icon must be a regular file');
  if (info.size > MAX_ICON_BYTES) throw new Error('Plugin icon exceeds 256 KiB');
  const bytes = await readFile(file);
  if (bytes.length > MAX_ICON_BYTES) throw new Error('Plugin icon exceeds 256 KiB');
  return { icon, mediaType, bytes: bytes.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await checkIcon();
    console.log(`Plugin icon OK: ${result.icon} (${result.bytes} / ${MAX_ICON_BYTES} bytes, ${result.mediaType})`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
