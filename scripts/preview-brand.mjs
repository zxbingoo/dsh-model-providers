// Self-contained design proof, rendered from the same sidebar component as the app.
// No Harness boot, credentials, network requests or replacement web server required.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let plugin;
const rows = [];
vm.runInNewContext(await readFile(new URL('../client.js', import.meta.url), 'utf8'), {
  window: { __ModuleLoader__: { load: def => { plugin = def.factory(() => React); } } },
});
plugin.apply({ slots: {
  inject: (_name, callback) => callback(),
  register: (options, component) => rows.push({ options, component }),
} });
const Icon = rows.find(r => r.options.name === 'sidebar.panellist').component;
const icon = renderToStaticMarkup(React.createElement(Icon));
const avatar = 'data:image/png;base64,' + (await readFile(new URL('../assets/avatar.png', import.meta.url))).toString('base64');
const html = `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Model Providers · 图标设计预览</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#eef1f7;color:#172033;font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
main{width:1100px;margin:auto;padding:42px 46px 36px}.eyebrow{font-size:10px;letter-spacing:2.1px;font-weight:700;color:#6d7b95}header{display:flex;align-items:end;justify-content:space-between;margin:12px 0 28px}h1{font-size:30px;font-weight:650;letter-spacing:-1px;margin:0 0 6px}header p{font-size:13px;color:#738099;margin:0}header code{font-size:11px;color:#738099}.grid{display:grid;grid-template-columns:1fr 1fr;gap:22px}.card{border:1px solid #dfe5ef;border-radius:24px;background:#fff;padding:26px;overflow:hidden}h2{font-size:12px;letter-spacing:1px;margin:0;font-weight:600}h2 span{font-size:10px;letter-spacing:2px;color:#919db1;margin-right:12px}.hero{height:204px;display:grid;place-items:center}.hero svg{width:96px;height:96px;color:#28384e}.copy{font-size:13px;line-height:1.7;color:#78849a;margin:4px 0 22px}.samples{display:grid;gap:10px}.sample{display:flex;align-items:center;gap:12px;border:1px solid #e3e9f1;border-radius:12px;padding:14px 16px;font-size:13px;background:#f5f7fb;color:#344760}.sample svg{flex-shrink:0}.sample small{margin-left:auto;font-size:10px;color:#8a96aa}.sample.dark{background:#1b222f;color:#e3eaf4;border-color:#2d3747}.sample.active{color:#315efb;background:#edf2ff;border-color:#dce5ff}.avatar-card{background:#101827;color:#edf3fc;border-color:#1a273d}.avatar-card h2 span{color:#7f91ad}.avatar-hero{height:250px;display:grid;place-items:center}.avatar-hero img{width:210px;height:210px;border-radius:36px}.avatar-card .copy{color:#98a9c3;margin-top:0}.avatars{display:flex;align-items:center;gap:17px;padding:15px 0}.avatars img{display:block;width:48px;height:48px;border-radius:12px}.avatars img.round{width:40px;height:40px;border-radius:50%}.avatars strong{display:block;font-size:12px;font-weight:600;letter-spacing:-.15px}.avatars small{font-size:10px;color:#8094b5;display:block;margin-top:5px}.legend{border-top:1px solid #27334a;margin-top:12px;padding-top:16px;font-size:10px;letter-spacing:.4px;color:#8094b5}footer{display:flex;justify-content:space-between;margin-top:24px;font-size:10px;letter-spacing:.25px;color:#8b97a9}svg{display:block}
</style>
<main>
<div class="eyebrow">MODEL PROVIDERS / VISUAL IDENTITY</div>
<header><div><h1>一个入口，多种模型。</h1><p>同一套“路由核心 × 模型端点”，为导航与品牌分别优化。</p></div><code>dsh-model-providers</code></header>
<div class="grid">
<section class="card"><h2><span>01</span>侧栏 · Model Router</h2><div class="hero">${icon}</div><p class="copy">单色线性标记：输入 → 分发核心 → 多个模型。<br>18px 原生尺寸，随主题与交互状态变色。</p><div class="samples"><div class="sample">${icon}<span>Providers</span><small>Light · 18px</small></div><div class="sample dark">${icon}<span>Providers</span><small>Dark · 18px</small></div><div class="sample active">${icon}<span>Providers</span><small>Selected · 18px</small></div></div></section>
<section class="card avatar-card"><h2><span>02</span>头像 · Routing Core</h2><div class="avatar-hero"><img src="${avatar}" alt="青蓝紫路由核心连接三个模型端点"></div><p class="copy">彩色多层核心与三条分发路径。<br>青色、蓝色与紫色，表达不同模型的连接。</p><div class="avatars"><img src="${avatar}" alt="48px 插件头像"><img class="round" src="${avatar}" alt="40px 圆形裁切"><div><strong>Model Providers</strong><small>Square / circular avatar</small></div></div><div class="legend">CYAN → BLUE → VIOLET · WHITE / ROUNDED</div></section>
</div>
<footer><span>设计预览 · 非当前 GUI 截图</span><span>Sidebar: SVG / Avatar: PNG · 不使用第三方模型商标</span></footer>
</main></html>`;
const docs = new URL('../docs/', import.meta.url);
await mkdir(docs, { recursive: true });
await writeFile(new URL('brand-preview.html', docs), html, 'utf8');
console.log('Brand preview:', new URL('brand-preview.html', docs).pathname);
