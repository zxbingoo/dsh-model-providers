// Offline review artifact: render the actual no-build ModuleLoader client with mock services.
// No server, credentials, real account lookup, model inference or browser runtime JS is used.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const output = new URL('../docs/account-usage.html', import.meta.url);
const checkedAt = '2026-11-05T02:00:00Z';
const snapshot = () => ({
  version: 1, state: 'ready',
  account: { type: 'chatgpt', email: 'r***@example.invalid', planType: 'plus', workspaceName: 'Review Workspace' },
  usage: {
    ordinaryUsageAllowed: true,
    rateLimits: [
      { id: 'codex', name: 'Codex', planType: 'plus', primary: { usedPercent: 32, windowDurationMins: 300, resetsAt: 1793847600 }, secondary: { usedPercent: 57, windowDurationMins: 10080, resetsAt: 1794355200 }, credits: { hasCredits: true, unlimited: false, balance: '120.5000' } },
    ],
    resetCredits: {
      availableCount: '2',
      details: [
        { type: 'codexRateLimits', status: 'available', title: '完全重置', description: 'NOT_RENDERED_DESCRIPTION', grantedAt: 1793757600, expiresAt: 1796068860, expiryKnown: true },
        { type: 'codexRateLimits', status: 'available', title: '完全重置', description: null, grantedAt: 1793757600, expiresAt: 1796164440, expiryKnown: true },
        { type: 'codexRateLimits', status: 'redeemed', title: 'NOT_RENDERED_HISTORY', description: null, grantedAt: 1793757600, expiresAt: null, expiryKnown: true },
      ],
    },
  },
  checkedAt, message: null,
});
const partialSnapshot = () => {
  const dto = snapshot();
  dto.account.planType = 'pro';
  dto.usage.rateLimits[0].primary.usedPercent = null;
  dto.usage.rateLimits[0].primary.resetsAt = null;
  dto.usage.rateLimits[0].secondary.usedPercent = 0;
  dto.usage.resetCredits.availableCount = '9';
  dto.usage.resetCredits.details[0].expiresAt = null;
  dto.usage.resetCredits.details[0].expiryKnown = false;
  dto.usage.resetCredits.details[1].expiresAt = null;
  return dto;
};
const scenarios = [
  { id: 'ready', title: '浅色 · 精简展示', caption: '套餐、额度、重置时间；重置卡仅保留可用数量与到期信息。', response: snapshot },
  { id: 'partial', title: '深色 · 缺失数据', caption: '未提供不等于 0；重置卡数量独立于已返回的卡片条数。', dark: true, response: partialSnapshot },
  { id: 'error', title: '刷新失败', caption: '旧数据立即清除，不展示原始错误。', failRefresh: true, response: snapshot },
  { id: 'settings', title: '浅色 · 模型 Tab（默认）', caption: '首次展开默认显示模型；切换 Tab 或重新展开保留内容，额度仅隐藏不卸载，不重复查询或写入配置。', showSettings: true, response: snapshot },
];

async function renderScenario(scenario) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://offline-preview.invalid/' });
  const old = { window: globalThis.window, document: globalThis.document, flag: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let plugin, Panel, accountCalls = 0, catalogCalls = 0, writes = 0, finishRefresh;
  const ok = value => ({ ok: true, value });
  const ctx = {
    slots: { inject: (_name, fn) => fn(), register: (options, component) => { if (options.name === 'main') Panel = component; } },
    remote: {
      $on: () => () => {},
      // These are local mock responses; no model catalog or model request leaves this process.
      session: { modelCatalog: async () => {
        ++catalogCalls;
        return ok({ groups: [{ id: 'codex-cli', models: [{ id: 'gpt-6.1-sol', name: 'gpt-6.1-sol' }] }] });
      } },
      settings: {
        describe: async () => ok({ namespaces: [
          { ns: 'harness-codex-cli-link', revision: 'mock-r1', value: { enabled: true, model: 'gpt-6.1-sol', reasoningEffort: 'default' } },
          { ns: 'agent-default-model', revision: 'mock-d1', value: { provider: 'codex-cli', model: 'gpt-6.1-sol' } },
        ] }),
        update: async () => { ++writes; throw new Error('Preview must not write settings'); },
        mutate: async () => { ++writes; throw new Error('Preview must not write settings'); },
      },
    },
    connection: { rpc: { call: async (path, method, payload, signal) => {
      if (method === 'status') {
        assert.equal(path, '/harness-codex-cli-link');
        assert.equal(JSON.stringify(payload), '{"refresh":false}');
        return ok({ namespace: 'harness-codex-cli-link', models: [{ id: 'gpt-6.1-sol', context: { contextWindow: 475000 }, contextSource: 'codex-native-catalog' }] });
      }
      ++accountCalls;
      assert.equal(path, '/harness-codex-cli-link'); assert.equal(method, 'accountUsage');
      assert.equal(JSON.stringify(payload), '{}'); assert(signal instanceof AbortSignal);
      if (scenario.failRefresh && accountCalls > 1) {
        // Hold the existing explicit refresh locally so its busy icon state can be checked.
        await new Promise(resolve => { finishRefresh = resolve; });
        throw new Error('PREVIEW_TRANSPORT_SECRET_MUST_NOT_RENDER');
      }
      return ok(scenario.response());
    } } },
  };
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load: definition => { plugin = definition.factory(name => { assert.equal(name, 'react'); return React; }); } } },
    AbortController,
    setTimeout: () => { throw new Error('Preview account polling is forbidden'); },
    setInterval: () => { throw new Error('Preview account polling is forbidden'); },
  });
  plugin.apply(ctx);
  assert.equal(accountCalls, 0, 'applying the plugin must not query account usage');
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(Panel)));
    assert.equal(accountCalls, 1, 'mounting an unloaded panel must query account usage once, even while collapsed');
    const catalogCallsAfterMount = catalogCalls;
    const toggle = document.querySelector('.hccl-config-button');
    const details = document.getElementById('hccl-codex-details');
    assert(toggle && details, 'one unified details toggle and region must be mounted');
    assert.equal(document.querySelectorAll('.hccl-config-button').length, 1);
    assert.match(toggle.textContent.trim(), /^展开/);
    assert.equal(toggle.getAttribute('aria-controls'), details.id);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(details.hidden, true, 'the unified details region must start collapsed');
    const tablist = details.querySelector('[role="tablist"]');
    assert(tablist, 'the unified region must contain a tablist');
    assert.equal(tablist.querySelectorAll('[role="tab"]').length, 2);
    const usageTab = tablist.querySelector('#hccl-codex-tab-usage[role="tab"]');
    const settingsTab = tablist.querySelector('#hccl-codex-tab-settings[role="tab"]');
    const usagePanel = details.querySelector('#hccl-codex-usage[role="tabpanel"]');
    const settingsPanel = details.querySelector('#hccl-codex-settings[role="tabpanel"]');
    assert.deepEqual([...settingsPanel.querySelectorAll('.hccl-actions button')].map(button => button.textContent), ['保存配置', '设为 Harness 默认模型'], 'model actions must not include the removed discard-and-reload button');
    assert.deepEqual([...tablist.querySelectorAll('[role="tab"]')], [settingsTab, usageTab], 'tab order must be model then usage');
    assert.deepEqual([...details.querySelectorAll('[role="tabpanel"]')], [settingsPanel, usagePanel], 'tabpanel order must match model then usage');
    for (const [tab, panel, label] of [[settingsTab, settingsPanel, '模型'], [usageTab, usagePanel, '套餐与额度']]) {
      assert(tab && panel, `${label} tab and panel must remain mounted`);
      assert.equal(tab.textContent.trim(), label);
      assert.equal(tab.getAttribute('aria-controls'), panel.id);
      assert.equal(panel.getAttribute('aria-labelledby'), tab.id);
    }
    const assertTabState = selected => {
      assert.equal(usageTab.getAttribute('aria-selected'), String(selected === 'usage'));
      assert.equal(settingsTab.getAttribute('aria-selected'), String(selected === 'settings'));
      assert.equal(usagePanel.hidden, selected !== 'usage');
      assert.equal(settingsPanel.hidden, selected !== 'settings');
    };
    assertTabState('settings');
    await act(async () => toggle.click());
    assert.match(toggle.textContent.trim(), /^收起/);
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(details.hidden, false);
    assertTabState('settings');
    assert.equal(accountCalls, 1, 'expanding the unified region must not repeat the auto request');
    assert.equal(writes, 0, 'expanding the unified region must not write settings');
    const usage = usagePanel.querySelector('[role="region"][aria-label="账号与额度"]');
    assert(usage, 'account usage must remain mounted inside its tabpanel');
    const modelHead = settingsPanel.querySelector('.hccl-model-head');
    const usageHead = usage.querySelector('.hccl-usage-head');
    const modelRefresh = settingsPanel.querySelector('button.hccl-refresh-button[aria-label="刷新模型"]');
    const usageRefresh = usage.querySelector('button.hccl-refresh-button[aria-label="刷新额度"]');
    assert.equal(details.querySelectorAll('button.hccl-refresh-button').length, 2, 'each tab must have one shared-style refresh icon');
    const assertRefreshButton = (button, header, label, busy = false) => {
      assert(button && header, `${label} must exist in its tab header`);
      assert.equal(button.parentElement, header, `${label} must be a direct header action`);
      assert.equal(header.lastElementChild, button, `${label} must be the trailing header action`);
      assert.equal(header.querySelectorAll('button.hccl-refresh-button').length, 1);
      assert.equal(button.getAttribute('aria-label'), label);
      assert.equal(button.getAttribute('title'), busy ? `${label}中…` : label);
      assert.equal(button.getAttribute('aria-busy'), String(busy));
      assert.equal(button.disabled, busy, 'refresh busy state and disabled state must agree');
      assert.equal(button.textContent.trim(), '', 'refresh buttons must not contain visible text');
      assert.equal(button.children.length, 1, 'refresh buttons must contain only their SVG icon');
      assert.equal(button.firstElementChild.localName, 'svg');
      assert.equal(button.firstElementChild.getAttribute('aria-hidden'), 'true');
    };
    const hoverRefresh = async button => {
      const callsBeforeHover = [catalogCalls, accountCalls, writes];
      await act(async () => {
        for (const type of ['mouseover', 'mouseout']) button.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true }));
      });
      assert.deepEqual([catalogCalls, accountCalls, writes], callsBeforeHover, 'native title hover must not query models or usage, or write settings');
    };
    assertRefreshButton(modelRefresh, modelHead, '刷新模型');
    assertRefreshButton(usageRefresh, usageHead, '刷新额度');
    await hoverRefresh(modelRefresh);
    assert.equal(usage.closest('[hidden]'), usagePanel, 'the default model tab must hide the retained account usage');
    const usageMarkupBeforeSwitch = usage.innerHTML;
    await act(async () => usageTab.click());
    assertTabState('usage');
    assert.equal(usagePanel.querySelector('[role="region"][aria-label="账号与额度"]'), usage);
    assert.equal(usage.innerHTML, usageMarkupBeforeSwitch, 'showing usage must retain its already loaded DOM');
    assert.equal(accountCalls, 1, 'selecting usage after the default model tab must not repeat the auto request');
    assert.equal(writes, 0, 'selecting usage must not write settings');
    await hoverRefresh(usageRefresh);
    if (scenario.failRefresh) {
      await act(async () => usageRefresh.click());
      assert.equal(typeof finishRefresh, 'function', 'the explicit mock refresh must be pending');
      assertRefreshButton(usageRefresh, usageHead, '刷新额度', true);
      await act(async () => finishRefresh());
      assertRefreshButton(usageRefresh, usageHead, '刷新额度');
    }
    assert.equal(accountCalls, scenario.failRefresh ? 2 : 1, 'only an explicit refresh may add a request');
    assert.equal(writes, 0);
    assert.equal(usage.dataset.state, scenario.failRefresh ? 'connectionError' : scenario.response().state);
    if (scenario.failRefresh) {
      assert.equal(usage.querySelector('.hccl-usage-plan'), null);
      assert.equal(usage.querySelector('.hccl-usage-bucket'), null);
    }
    assert.doesNotMatch(usage.innerHTML, /NOT_RENDERED_|example\.invalid|Review Workspace|120\.5000/);
    assert.equal(usage.querySelectorAll('button').length, 1, 'only the manual refresh action is present');
    if (scenario.showSettings) {
      const callsBeforeSwitch = accountCalls;
      const usageMarkup = usage.innerHTML;
      await act(async () => settingsTab.click());
      assertTabState('settings');
      assert.equal(details.hidden, false);
      assert.equal(usage.isConnected, true, 'switching tabs must not unmount account usage');
      assert.equal(usagePanel.querySelector('[role="region"][aria-label="账号与额度"]'), usage);
      assert.equal(usage.closest('[hidden]'), usagePanel, 'account usage must be hidden by its retained tabpanel');
      assert.equal(usage.innerHTML, usageMarkup, 'switching tabs must retain loaded account usage DOM');
      assert.equal(accountCalls, callsBeforeSwitch, 'switching tabs must not query account usage again');
      assert.equal(writes, 0, 'switching tabs must not write settings');
    }
    const selectedTab = scenario.showSettings ? 'settings' : 'usage';
    const callsBeforeCollapse = accountCalls;
    const usageMarkupBeforeCollapse = usage.innerHTML;
    await act(async () => toggle.click());
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(details.hidden, true);
    assertTabState(selectedTab);
    await act(async () => toggle.click());
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(details.hidden, false);
    assertTabState(selectedTab);
    assert.equal(usagePanel.querySelector('[role="region"][aria-label="账号与额度"]'), usage, 'collapsing and reopening must retain mounted usage');
    assert.equal(usage.innerHTML, usageMarkupBeforeCollapse, 'collapsing and reopening must retain loaded usage DOM');
    assert.equal(accountCalls, callsBeforeCollapse, 'collapsing and reopening must not repeat account usage requests');
    assert.equal(writes, 0, 'collapsing and reopening must not write settings');
    assert.equal(catalogCalls, catalogCallsAfterMount, 'tab changes, collapsing and hover must not refresh the model catalog');
    assertRefreshButton(modelRefresh, modelHead, '刷新模型');
    assertRefreshButton(usageRefresh, usageHead, '刷新额度');
    const clone = document.querySelector('.hccl').cloneNode(true);
    const css = clone.querySelector('style').textContent;
    clone.querySelector('style').remove();
    // This output is intentionally static. Keep real component markup but avoid inert-looking actions.
    for (const control of clone.querySelectorAll('button,input,select')) control.disabled = true;
    // Each scenario contains a full actual Panel; namespace IDs in the static combined document.
    for (const element of clone.querySelectorAll('[id]')) element.id = `${scenario.id}-${element.id}`;
    for (const element of clone.querySelectorAll('[for]')) element.setAttribute('for', `${scenario.id}-${element.getAttribute('for')}`);
    for (const attribute of ['aria-controls', 'aria-labelledby']) {
      for (const element of clone.querySelectorAll(`[${attribute}]`)) {
        const references = element.getAttribute(attribute).trim().split(/\s+/).filter(Boolean);
        element.setAttribute(attribute, references.map(id => `${scenario.id}-${id}`).join(' '));
      }
    }
    assert(!clone.outerHTML.includes('PREVIEW_TRANSPORT_SECRET'));
    return { ...scenario, html: clone.outerHTML, css };
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    globalThis.window = old.window; globalThis.document = old.document; globalThis.IS_REACT_ACT_ENVIRONMENT = old.flag;
  }
}

const rendered = [];
for (const scenario of scenarios) rendered.push(await renderScenario(scenario));
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '本地';
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<title>模拟数据·离线界面预览 — dsh-model-providers ${version}</title>
<style>
${rendered[0].css}
:root{color-scheme:light;font-family:system-ui,sans-serif;color:#20252d;background:#f2f4f7}body{margin:0;padding:28px 20px 48px}a{color:inherit;text-underline-offset:4px}.preview-intro,.preview-section{max-width:1040px;margin:0 auto 28px}.preview-intro{padding:24px;border:2px solid #a86c19;border-radius:14px;background:#fff8e9}.preview-intro h1{font-size:25px;line-height:1.3;margin:0 0 12px}.preview-intro p{font-size:13px;line-height:1.7;margin:8px 0}.preview-intro strong{color:#80500c}.preview-nav{display:flex;flex-wrap:wrap;gap:18px;font-size:13px;margin-top:16px}.preview-section>h2{font-size:17px;margin:0 0 8px}.preview-section>p{font-size:13px;line-height:1.6;margin:0 0 12px;color:#535c6c}.preview-frame{border:1px solid #d8dce4;border-radius:14px;overflow:hidden;--dsw-alias-bg-base:#fff;--dsw-alias-bg-l1:#fafbfc;--dsw-alias-text-primary:#20252d;--dsw-alias-text-secondary:#596273;--dsw-alias-border-l3:#dce0e7;--dsw-alias-accent-primary:#5578d9}.preview-frame.dark{color-scheme:dark;--dsw-alias-bg-base:#1b1f27;--dsw-alias-bg-l1:#222733;--dsw-alias-text-primary:#e8ebf2;--dsw-alias-text-secondary:#b5bece;--dsw-alias-border-l3:#424957;--dsw-alias-accent-primary:#87a1ff}.preview-frame .hccl{height:auto;overflow:visible}.preview-frame .hccl-wrap{padding:32px 28px}.preview-frame .hccl-usage button:disabled{opacity:.6}.preview-footnote{max-width:1040px;margin:0 auto;font-size:12px;line-height:1.7;color:#535c6c}@media(max-width:640px){body{padding:14px 10px 28px}.preview-intro{padding:18px}.preview-intro h1{font-size:21px}.preview-frame .hccl-wrap{padding:24px 12px}}
</style>
</head>
<body>
<header class="preview-intro">
<h1>模拟数据·离线界面预览</h1>
<p><strong>dsh-model-providers ${version} · 仅用于 UI 展示</strong></p>
<p><strong>模拟数据，不是当前 DSH GUI 或真实账号截图。</strong>静态预览不反映当前插件加载状态。</p>
<p>实际组件的静态预览，无网络请求，按钮不可用。时间按 ${timezone} 展示；不提供历史记录或使用重置卡操作。</p>
<nav class="preview-nav" aria-label="审核场景">${rendered.map(item => `<a href="#preview-${item.id}">${item.title}</a>`).join('')}</nav>
</header>
${rendered.map(item => `<section class="preview-section" id="preview-${item.id}" aria-label="${item.title}"><h2>${item.title}</h2><p>${item.caption}</p><div class="preview-frame${item.dark ? ' dark' : ''}">${item.html}</div></section>`).join('\n')}
<p class="preview-footnote">模型 / 套餐与额度依次由同一展开按钮收纳，默认收起，首次展开默认显示模型，再次展开保留当前 Tab；两处刷新均为各 Tab 内容区右上角的图标按钮，悬停只显示操作提示，不发起请求。切 Tab 或折叠保留内容，不重复查询或写配置。进入页面尚未加载时自动查询一次（即使收起或停留在模型 Tab），可手动刷新；不轮询，失败不循环重试，离页取消且不保留快照。真实账号端到端验证尚未进行。</p>
</body>
</html>
`;
assert(!html.includes('PREVIEW_TRANSPORT_SECRET'));
assert(!/<script\b/i.test(html));
await mkdir(new URL('../docs/', import.meta.url), { recursive: true });
// Observe an existing generated artifact before replacing it; nothing else is written.
try { await readFile(output, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeFile(output, html, 'utf8');
console.log(`Generated ${fileURLToPath(output)}`);
console.log('Offline static preview: compact light + partial dark + failed refresh + model tab (default); mock data only, no live account/model calls.');
