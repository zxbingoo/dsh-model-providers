import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkIcon, MAX_ICON_BYTES } from '../scripts/check-icon.mjs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

async function sidebarSvg() {
  let plugin;
  const registrations = [];
  vm.runInNewContext(await readFile(new URL('../client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(def) { plugin = def.factory(() => React); } } },
  });
  plugin.apply({ slots: {
    inject(_slot, callback) { callback(); },
    register(options, component) { registrations.push({ options, component }); },
  } });
  const row = registrations.find(r => r.options.name === 'sidebar.panellist');
  assert.equal(row.options.label, 'Providers');
  assert.equal(row.options.id, 'harness-codex-cli-link', 'Existing navigation identity must remain stable');
  const markup = renderToStaticMarkup(React.createElement(row.component));
  return new JSDOM(markup, { contentType: 'image/svg+xml' });
}

const shape = node => ({
  tag: node.tagName,
  attributes: Object.fromEntries([...node.attributes].map(a => [a.name, a.value]).sort(([a], [b]) => a.localeCompare(b))),
});

test('sidebar mark is a small theme-aware model router, not the old terminal window', async () => {
  const dom = await sidebarSvg();
  try {
    const svg = dom.window.document.documentElement;
    for (const [key, value] of Object.entries({ width: '18', height: '18', viewBox: '-2 -2 28 28', stroke: 'currentColor', fill: 'none', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) {
      assert.equal(svg.getAttribute(key), value, key);
    }
    assert.equal(svg.querySelectorAll('rect').length, 3, 'Three separated model endpoints');
    assert.equal(svg.querySelectorAll('path').length, 2, 'Routing paths plus the central diamond');
    assert.equal(svg.querySelectorAll('image,script,foreignObject,filter,linearGradient').length, 0, 'No raster shrink, active content or tiny-size effects');
    assert([...svg.querySelectorAll('rect')].every(n => n.getAttribute('width') === '4'));
  } finally { dom.window.close(); }
});

test('distributed sidebar SVG matches the registered React component exactly', async () => {
  const rendered = await sidebarSvg();
  const asset = new JSDOM(await readFile(new URL('../assets/sidebar-icon.svg', import.meta.url), 'utf8'), { contentType: 'image/svg+xml' });
  try {
    const runtime = rendered.window.document.documentElement;
    const saved = asset.window.document.documentElement;
    assert.deepEqual([...runtime.children].map(shape), [...saved.children].map(shape));
    for (const name of ['width', 'height', 'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']) {
      assert.equal(runtime.getAttribute(name), saved.getAttribute(name));
    }
  } finally { rendered.window.close(); asset.window.close(); }
});

test('metadata avatar is a packaged rounded PNG within the 256 KiB limit', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.icon, 'assets/avatar.png');
  const avatar = await readFile(new URL('../' + pkg.icon, import.meta.url));
  assert.deepEqual([...avatar.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(avatar[25], 6, 'RGBA preserves transparent rounded corners');
  assert(avatar.length <= 256 * 1024, 'DSH limits raw metadata icon bytes, not compressed archive size');
  assert.equal(MAX_ICON_BYTES, 256 * 1024);
  assert.deepEqual(await checkIcon(), { icon: pkg.icon, mediaType: 'image/png', bytes: avatar.length });
  assert.equal(pkg.scripts.prepack, 'node scripts/check-icon.mjs');
  assert(pkg.files.includes('scripts/check-icon.mjs'));
});

test('icon guard rejects the original oversized PNG via a temporary manifest', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-brand-icon-'));
  try {
    await writeFile(join(directory, 'avatar.png'), Buffer.alloc(MAX_ICON_BYTES + 1));
    const manifest = join(directory, 'package.json');
    await writeFile(manifest, JSON.stringify({ icon: 'avatar.png' }));
    await assert.rejects(checkIcon(manifest), /Plugin icon exceeds 256 KiB/u);
  } finally {
    assert.equal(resolve(directory, '..'), resolve(tmpdir()), 'Only remove the generated temporary fixture');
    assert(directory.startsWith(join(tmpdir(), 'dsh-brand-icon-')));
    await rm(directory, { recursive: true, force: true });
  }
});

test('original avatar remains a packaged square PNG and each brand asset is exportable offline', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const avatar = await readFile(new URL('../assets/avatar.png', import.meta.url));
  assert.deepEqual([...avatar.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const width = avatar.readUInt32BE(16), height = avatar.readUInt32BE(20);
  assert.equal(width, height);
  assert(width >= 512, 'Avatar source must be large enough for plugin/profile uses');
  assert(avatar.length <= MAX_ICON_BYTES, 'Legacy PNG path must also satisfy host metadata limits');
  const require = createRequire(new URL('../package.json', import.meta.url));
  for (const name of ['assets/avatar-icon.jpg', 'assets/avatar.png', 'assets/sidebar-icon.svg']) {
    assert(pkg.files.includes(name));
    assert.equal(pkg.exports['./' + name], './' + name);
    assert.equal(require.resolve(pkg.name + '/' + name), new URL('../' + name, import.meta.url).pathname);
  }
});
