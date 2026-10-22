import { rm, lstat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputPath = resolve(projectRoot, 'dist');

// Keep cleanup inside this game's own dist directory on every platform.
if (dirname(outputPath) !== projectRoot || basename(outputPath) !== 'dist') {
  throw new Error('Unexpected build output path.');
}
const outputInfo = await lstat(outputPath).catch(error => {
  if (error.code === 'ENOENT') return null;
  throw error;
});
if (outputInfo?.isSymbolicLink()) throw new Error('Build output must not be a symbolic link.');

// Vite's native recursive cleanup can abort on Windows; Node's removal is reliable.
await rm(outputPath, { recursive: true, force: true });
await build({ root: projectRoot, build: { outDir: outputPath, emptyOutDir: false } });
