import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
const checkedAt = '2026-11-05T02:00:00Z';
const ready = () => ({
  version: 1, state: 'ready',
  account: { type: 'chatgpt', email: 'r***@example.test', planType: 'plus', workspaceName: '审核工作区' },
  usage: {
    ordinaryUsageAllowed: true,
    rateLimits: [
      { id: 'codex', name: 'Codex 默认', planType: 'Plus', primary: { usedPercent: 12.5, windowDurationMins: 300, resetsAt: 1793757600 }, secondary: { usedPercent: 0, windowDurationMins: 10080, resetsAt: null }, credits: { hasCredits: false, unlimited: null, balance: null } },
      { id: 'review', name: '代码审核', planType: null, primary: { usedPercent: null, windowDurationMins: 90, resetsAt: 0 }, secondary: { usedPercent: 125.25, windowDurationMins: 2880, resetsAt: 1793923200 }, credits: { hasCredits: true, unlimited: false, balance: '12345678901234567890.0100' } },
    ],
    resetCredits: {
      availableCount: '7',
      details: [
        { type: 'codexRateLimits', status: 'available', title: '有效期未知', description: 'HIDDEN_RESET_DESCRIPTION', grantedAt: 123456789, expiresAt: 1793923200, expiryKnown: false },
        { type: 'codexRateLimits', status: 'available', title: '不过期卡', description: 'HIDDEN_RESET_DESCRIPTION', grantedAt: 123456789, expiresAt: null, expiryKnown: true },
        { type: 'unknown', status: 'available', title: '有到期时间', description: 'HIDDEN_RESET_DESCRIPTION', grantedAt: 123456789, expiresAt: 1793923200, expiryKnown: true },
        { type: 'codexRateLimits', status: 'redeeming', title: '正在兑换卡', description: 'HIDDEN_RESET_HISTORY', grantedAt: 123456789, expiresAt: null, expiryKnown: true },
        { type: 'codexRateLimits', status: 'redeemed', title: '已使用历史卡', description: 'HIDDEN_RESET_HISTORY', grantedAt: 123456789, expiresAt: null, expiryKnown: true },
        { type: 'codexRateLimits', status: 'expired', title: '已过期历史卡', description: 'HIDDEN_RESET_HISTORY', grantedAt: 123456789, expiresAt: 1793757600, expiryKnown: true },
      ],
    },
  },
  checkedAt, message: null,
});
const ok = value => ({ ok: true, value });
const catalogReady = () => ok({ groups: [{ id: 'codex-cli', models: [{ id: 'gpt-6.1-sol' }, { id: 'custom-model' }] }] });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const localDate = seconds => new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset',
}).format(new Date(seconds * 1000));
const newAccountReady = () => {
  const snapshot = ready();
  snapshot.account.planType = 'pro';
  snapshot.usage.rateLimits = [{ id: 'new-account', name: '新账号额度', primary: { usedPercent: 63.75, windowDurationMins: 300, resetsAt: null }, secondary: null }];
  snapshot.usage.resetCredits = { availableCount: '2', details: [{ type: 'codexRateLimits', status: 'available', title: '新账号重置卡', expiresAt: null, expiryKnown: true }] };
  return snapshot;
};

async function withPanel(handler, inspect, { strict = false, enabled = true, settingsUpdate = null, modelCatalog = null } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://review.invalid/' });
  const old = { window: globalThis.window, document: globalThis.document, flag: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const registrations = [], listeners = new Set();
  const calls = { accounts: [], writes: [], describe: 0, catalog: 0, timers: 0 };
  let row = { ns: 'harness-codex-cli-link', revision: 'r1', value: { enabled, model: 'gpt-6.1-sol', reasoningEffort: 'default' } };
  const defaults = { ns: 'agent-default-model', revision: 'd1', value: { provider: 'codex-cli', model: 'gpt-6.1-sol' } };
  const ctx = {
    slots: { inject: (_name, fn) => fn(), register: (options, component) => registrations.push({ options, component }) },
    remote: {
      $on: (_event, callback) => { listeners.add(callback); return () => listeners.delete(callback); },
      session: { modelCatalog: async () => { ++calls.catalog; return modelCatalog ? modelCatalog(calls.catalog) : catalogReady(); } },
      settings: {
        describe: async () => { ++calls.describe; return ok({ namespaces: [row, defaults] }); },
        update: async (ns, value, revision) => {
          calls.writes.push({ ns, value: { ...value }, revision });
          const result = settingsUpdate ? await settingsUpdate(ns, value, revision) : ok({ ns, value: { ...value }, revision: 'r2' });
          if (result.ok) row = result.value;
          return result;
        },
        mutate: async (...args) => { calls.writes.push(args); return ok(defaults); },
      },
    },
    connection: { rpc: { call: async (...args) => { calls.accounts.push(args); return handler(...args); } } },
  };
  let plugin;
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load: def => { plugin = def.factory(name => { assert.equal(name, 'react'); return React; }); } } },
    AbortController,
    setTimeout: () => { ++calls.timers; throw new Error('Account UI must not schedule polling'); },
    setInterval: () => { ++calls.timers; throw new Error('Account UI must not schedule polling'); },
  });
  plugin.apply(ctx);
  assert.equal(calls.accounts.length, 0, 'registering the plugin must not query accounts before its page is opened');
  const Panel = registrations.find(registration => registration.options.name === 'main').component;
  const container = document.getElementById('root');
  let root, mounted = false;
  const rerender = async () => {
    await act(async () => root.render(strict ? React.createElement(React.StrictMode, null, React.createElement(Panel)) : React.createElement(Panel)));
  };
  const mount = async () => {
    root = createRoot(container); mounted = true;
    await rerender();
  };
  const unmount = async () => {
    if (mounted) { await act(async () => root.unmount()); mounted = false; }
  };
  const usage = () => document.querySelector('[role="region"][aria-label="账号与额度"]');
  const details = () => document.getElementById('hccl-codex-details');
  const tab = name => document.getElementById(`hccl-codex-tab-${name}`);
  const toggleDetails = async () => { await act(async () => document.querySelector('.hccl-config-button').click()); };
  const showTab = async name => {
    if (details().hidden) await toggleDetails();
    await act(async () => tab(name).click());
  };
  const clickUsage = async () => {
    await showTab('usage');
    await act(async () => usage().querySelector('button[aria-label="刷新额度"]').click());
  };
  try {
    await mount();
    await inspect({ dom, calls, usage, details, tab, showTab, toggleDetails, clickUsage, mount, unmount, rerender, container, settingsEvent: async () => { await act(async () => { for (const listener of listeners) listener(); }); } });
  } finally {
    await unmount(); dom.window.close();
    globalThis.window = old.window; globalThis.document = old.document; globalThis.IS_REACT_ACT_ENVIRONMENT = old.flag;
  }
}

function assertRefreshButton(button, label, busy = false) {
  assert(button, `${label} has an accessible button`);
  assert.equal(button.tagName, 'BUTTON');
  assert.equal(button.type, 'button');
  assert(button.classList.contains('hccl-refresh-button'));
  assert.equal(button.getAttribute('aria-label'), label, 'the accessible action label remains stable while busy');
  assert.equal(button.title, busy ? `${label}中…` : label);
  assert.equal(button.getAttribute('aria-busy'), String(busy));
  assert.equal(button.disabled, busy);
  assert.equal(button.textContent, '', 'refresh controls are icon-only even while loading');
  assert.equal(button.childNodes.length, 1, 'there is no visible text node or label wrapper');
  const icon = button.firstElementChild;
  assert.equal(icon.localName, 'svg');
  assert.equal(icon.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(icon.getAttribute('aria-hidden'), 'true');
  return icon;
}

function assertSelectedTab(active) {
  const tablist = document.querySelector('[role="tablist"][aria-label="Codex 配置分区"]');
  assert(tablist, 'the shared disclosure has an accessible tablist');
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  assert.equal(tabs.length, 2);
  assert.equal(tabs.filter(tab => tab.getAttribute('aria-selected') === 'true').length, 1);
  assert.equal(tabs.filter(tab => tab.tabIndex === 0).length, 1);
  assert.deepEqual(tabs.map(tab => tab.id), ['hccl-codex-tab-settings', 'hccl-codex-tab-usage'], 'Model comes first in DOM and keyboard order');
  for (const name of ['settings', 'usage']) {
    const tab = document.getElementById(`hccl-codex-tab-${name}`);
    const panel = document.getElementById(`hccl-codex-${name}`);
    assert(tablist.contains(tab));
    assert.equal(tab.tagName, 'BUTTON');
    assert.equal(tab.type, 'button');
    assert.equal(tab.getAttribute('aria-controls'), panel.id);
    assert.equal(tab.getAttribute('aria-selected'), String(name === active));
    assert.equal(tab.tabIndex, name === active ? 0 : -1);
    assert.equal(panel.getAttribute('role'), 'tabpanel');
    assert.equal(panel.getAttribute('aria-labelledby'), tab.id);
    assert.equal(panel.hidden, name !== active);
  }
}

test('one disclosure contains both mounted panels with Model selected on entry and first expansion and linked accessible tabs', async () => {
  await withPanel(async () => ok(ready()), async ({ calls, usage, details, tab, showTab, toggleDetails }) => {
    const configure = document.querySelector('.hccl-config-button');
    const shared = details();
    const usagePanel = document.getElementById('hccl-codex-usage');
    const settingsPanel = document.getElementById('hccl-codex-settings');
    const usageNode = usage();
    const model = document.getElementById('hccl-model');
    const baseline = { describe: calls.describe, catalog: calls.catalog };
    assert.equal(document.querySelectorAll('.hccl-config-button').length, 1);
    assert.equal(configure.closest('article').querySelectorAll('button[aria-expanded]').length, 1, 'there is no separate usage disclosure');
    assert.equal(configure.getAttribute('aria-controls'), shared.id);
    assert.equal(configure.getAttribute('aria-expanded'), 'false');
    assert.match(configure.textContent, /^展开/);
    assert.equal(shared.tagName, 'DIV');
    assert(shared.classList.contains('hccl-provider-details'));
    assert.equal(shared.hidden, true);
    assert.equal(shared.querySelectorAll('[role="tablist"]').length, 1);
    assert.equal(shared.querySelectorAll('[role="tabpanel"]').length, 2);
    assert.deepEqual([...shared.querySelectorAll('[role="tab"]')].map(node => node.textContent), ['模型', '套餐与额度'], 'Model is the first tab, not just the default selection');
    assert.deepEqual([...shared.querySelectorAll('[role="tab"]')].map(node => node.id), ['hccl-codex-tab-settings', 'hccl-codex-tab-usage']);
    assert.deepEqual([...shared.querySelectorAll('[role="tabpanel"]')].map(node => node.id), ['hccl-codex-settings', 'hccl-codex-usage'], 'panel DOM order matches the tabs');
    for (const id of ['hccl-codex-details', 'hccl-codex-tab-usage', 'hccl-codex-tab-settings', 'hccl-codex-usage', 'hccl-codex-settings']) {
      assert.equal(document.querySelectorAll(`#${id}`).length, 1, 'ARIA targets are unique');
    }
    assertSelectedTab('settings');
    assert.equal(document.querySelectorAll('.hccl-usage').length, 1);
    assert(usagePanel.contains(usageNode));
    assert.equal(usageNode.closest('.hccl-provider-details'), shared, 'usage remains mounted inside the shared collapsed disclosure');
    assert.equal(usageNode.closest('[hidden]'), usagePanel, 'usage starts in the inactive hidden tabpanel');
    assert.equal(model.closest('[hidden]'), shared);
    for (const selector of ['#hccl-model', '#hccl-custom-model', '#hccl-effort', '.hccl-actions', '.hccl-advanced']) {
      assert(settingsPanel.contains(document.querySelector(selector)), `${selector} stays inside settings`);
    }
    await toggleDetails();
    assert.equal(shared.hidden, false);
    assert.equal(configure.getAttribute('aria-expanded'), 'true');
    assert.match(configure.textContent, /^收起/);
    assertSelectedTab('settings');
    assert.equal(model.closest('[hidden]'), null, 'first expansion shows Model without a tab click');
    assert.equal(usageNode.closest('[hidden]'), usagePanel);
    await showTab('usage');
    assertSelectedTab('usage');
    assert.equal(usageNode.closest('[hidden]'), null);
    assert.equal(model.closest('[hidden]'), settingsPanel);
    await showTab('settings');
    assertSelectedTab('settings');
    assert.equal(model.closest('[hidden]'), null);
    assert.equal(usageNode.closest('[hidden]'), usagePanel);
    await toggleDetails();
    assert.equal(shared.hidden, true);
    assert.equal(configure.getAttribute('aria-expanded'), 'false');
    assert.match(configure.textContent, /^展开/);
    assertSelectedTab('settings');
    assert.equal(model.closest('[hidden]'), shared);
    await toggleDetails();
    assertSelectedTab('settings');
    assert.equal(details(), shared);
    assert.equal(usage(), usageNode);
    assert.equal(document.getElementById('hccl-model'), model);
    await showTab('usage');
    assertSelectedTab('usage');
    assert.equal(tab('usage').getAttribute('aria-selected'), 'true');
    assert.equal(calls.accounts.length, 1);
    assert.equal(calls.describe, baseline.describe);
    assert.equal(calls.catalog, baseline.catalog);
    assert.equal(calls.writes.length, 0);
  });
});

test('tabs wrap with Left/Right and Home/End, move focus, and leave normal Tab navigation alone', async () => {
  await withPanel(async () => ok(ready()), async ({ dom, calls, tab, showTab }) => {
    await showTab('settings');
    tab('settings').focus();
    assertSelectedTab('settings');
    for (const [key, expected] of [
      ['ArrowRight', 'usage'], ['ArrowRight', 'settings'], ['ArrowLeft', 'usage'], ['ArrowLeft', 'settings'],
      ['Home', 'settings'], ['End', 'usage'], ['End', 'usage'], ['Home', 'settings'],
    ]) {
      const event = new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      await act(async () => document.activeElement.dispatchEvent(event));
      assert.equal(event.defaultPrevented, true, `${key} is handled by the tablist`);
      assertSelectedTab(expected);
      assert.equal(document.activeElement, tab(expected), `${key} moves focus with selection`);
    }
    for (const options of [{ key: 'Tab' }, { key: 'Tab', shiftKey: true }, { key: 'x' }]) {
      const event = new dom.window.KeyboardEvent('keydown', { ...options, bubbles: true, cancelable: true });
      await act(async () => tab('settings').dispatchEvent(event));
      assert.equal(event.defaultPrevented, false, `${options.key} keeps its native behavior`);
      assertSelectedTab('settings');
      assert.equal(document.activeElement, tab('settings'));
    }
    await showTab('usage');
    assertSelectedTab('usage');
    assert.equal(calls.accounts.length, 1);
    assert.equal(calls.writes.length, 0);
  });
});

test('matching icon-only refresh controls sit at the right of each tab header and hovering only exposes native titles', async () => {
  await withPanel(async () => ok(ready()), async ({ dom, calls, usage, showTab }) => {
    const settingsPanel = document.getElementById('hccl-codex-settings');
    const modelRefresh = settingsPanel.querySelector('button[aria-label="刷新模型"]');
    const usageRefresh = usage().querySelector('button[aria-label="刷新额度"]');
    const modelIcon = assertRefreshButton(modelRefresh, '刷新模型');
    const usageIcon = assertRefreshButton(usageRefresh, '刷新额度');
    assert.equal(document.querySelectorAll('.hccl-refresh-button').length, 2);
    assert.equal(modelIcon.outerHTML, usageIcon.outerHTML, 'both actions use the same refresh icon');
    const modelHead = settingsPanel.querySelector('.hccl-model-head');
    const usageHead = usage().querySelector('.hccl-usage-head');
    assert.equal(modelHead.querySelector('h3').textContent, '模型与行为');
    assert.equal(usageHead.querySelector('h3').textContent, '套餐与额度');
    assert.equal(modelRefresh.parentElement, modelHead);
    assert.equal(usageRefresh.parentElement, usageHead);
    assert.equal(modelHead.lastElementChild, modelRefresh, 'model refresh is the trailing header action, not a separate setting row');
    assert.equal(usageHead.lastElementChild, usageRefresh, 'quota refresh is the trailing header action');
    assert.equal(modelHead.closest('[role="tabpanel"]'), settingsPanel);
    assert.equal(usageHead.closest('[role="tabpanel"]').id, 'hccl-codex-usage');
    assert(![...settingsPanel.querySelectorAll('.hccl-setting .hccl-label')].some(label => label.textContent === '模型目录'), 'the old standalone model-catalog row is removed');
    const baseline = { accounts: calls.accounts.length, catalog: calls.catalog, describe: calls.describe, writes: calls.writes.length, timers: calls.timers };
    for (const [name, button, label] of [['settings', modelRefresh, '刷新模型'], ['usage', usageRefresh, '刷新额度']]) {
      await showTab(name);
      assert.equal(button.closest('[hidden]'), null);
      await act(async () => {
        for (const type of ['mouseover', 'mouseenter', 'mousemove', 'mouseout', 'mouseleave']) {
          button.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true }));
        }
        button.focus();
      });
      assertRefreshButton(button, label);
      assert.equal(document.querySelector('[role="tooltip"]'), null, 'the title tooltip needs no custom popup or polling');
    }
    assert.deepEqual({ accounts: calls.accounts.length, catalog: calls.catalog, describe: calls.describe, writes: calls.writes.length, timers: calls.timers }, baseline, 'hovering, focusing and switching tabs never refresh or write settings');
  });
});

test('model and quota refresh busy states complete independently without writes or losing a dirty form', async () => {
  const pendingModels = deferred(), failedModels = deferred(), pendingUsage = deferred();
  let accountAttempt = 0;
  await withPanel(async () => ++accountAttempt === 1 ? ok(ready()) : pendingUsage.promise, async ({ dom, calls, usage, details, showTab, toggleDetails }) => {
    await showTab('settings');
    const modelRefresh = document.querySelector('button[aria-label="刷新模型"]');
    const usageRefresh = usage().querySelector('button[aria-label="刷新额度"]');
    const usageNode = usage();
    const oldPlan = usageNode.querySelector('.hccl-usage-plan');
    const model = document.getElementById('hccl-model');
    const effort = document.getElementById('hccl-effort');
    const advanced = document.querySelector('.hccl-advanced');
    await act(async () => { model.value = 'custom-model'; model.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    await act(async () => { effort.value = 'high'; effort.dispatchEvent(new dom.window.Event('change', { bubbles: true })); advanced.open = true; });
    const assertDirtyForm = () => {
      assert.equal(document.getElementById('hccl-model'), model);
      assert.equal(document.getElementById('hccl-effort'), effort);
      assert.equal(model.value, 'custom-model');
      assert.equal(document.getElementById('hccl-custom-model').value, 'custom-model');
      assert.equal(effort.value, 'high');
      assert.equal(document.querySelector('.hccl-advanced'), advanced);
      assert.equal(advanced.open, true);
      assert(document.querySelector('.hccl-unsaved'));
      assert.equal(calls.writes.length, 0);
      assert.equal(usage(), usageNode);
      assert.equal(document.querySelector('button[aria-label="刷新模型"]'), modelRefresh);
      assert.equal(usage().querySelector('button[aria-label="刷新额度"]'), usageRefresh);
    };
    const baseline = { catalog: calls.catalog, describe: calls.describe };
    assert.equal(calls.accounts.length, 1);
    assertRefreshButton(modelRefresh, '刷新模型');
    assertRefreshButton(usageRefresh, '刷新额度');
    await act(async () => modelRefresh.click());
    assertRefreshButton(modelRefresh, '刷新模型', true);
    assertRefreshButton(usageRefresh, '刷新额度');
    assert.equal(calls.catalog, baseline.catalog + 1);
    assert.equal(calls.describe, baseline.describe, 'the pending catalog read has not reloaded settings');
    assert.equal(calls.accounts.length, 1, 'refreshing models never queries account usage');
    assert.equal(usage().querySelector('.hccl-usage-plan'), oldPlan, 'refreshing models preserves loaded quota');
    assertDirtyForm();
    await act(async () => modelRefresh.click());
    assert.equal(calls.catalog, baseline.catalog + 1, 'the busy model button cannot start another catalog call');
    await showTab('usage');
    await act(async () => usageRefresh.click());
    assert.equal(calls.accounts.length, 2, 'quota refresh remains usable while models are loading');
    assert.equal(calls.catalog, baseline.catalog + 1, 'refreshing quota never queries the model catalog');
    assertRefreshButton(modelRefresh, '刷新模型', true);
    assertRefreshButton(usageRefresh, '刷新额度', true);
    const signal = calls.accounts[1][3];
    await toggleDetails();
    assert.equal(details().hidden, true);
    assert.equal(signal.aborted, false);
    assertDirtyForm();
    await toggleDetails();
    assertSelectedTab('usage');
    await act(async () => pendingModels.resolve(catalogReady()));
    assertRefreshButton(modelRefresh, '刷新模型');
    assertRefreshButton(usageRefresh, '刷新额度', true);
    assert.equal(calls.describe, baseline.describe + 1, 'a successful model refresh retains its original settings read');
    assertDirtyForm();
    await showTab('settings');
    await act(async () => modelRefresh.click());
    assert.equal(calls.catalog, baseline.catalog + 2, 'model refresh remains usable while quota is loading');
    assertRefreshButton(modelRefresh, '刷新模型', true);
    assertRefreshButton(usageRefresh, '刷新额度', true);
    await act(async () => pendingUsage.resolve(ok(newAccountReady())));
    assertRefreshButton(usageRefresh, '刷新额度');
    assertRefreshButton(modelRefresh, '刷新模型', true);
    assertSelectedTab('settings');
    assert.equal(usage().querySelector('.hccl-usage-plan').textContent, 'Pro');
    assert.equal(signal.aborted, false);
    assert.equal(calls.accounts.length, 2);
    assertDirtyForm();
    await act(async () => failedModels.reject(new Error('模拟模型目录失败')));
    assertRefreshButton(modelRefresh, '刷新模型');
    assertRefreshButton(usageRefresh, '刷新额度');
    assert.match(document.querySelector('.hccl-error').textContent, /模拟模型目录失败/);
    assert.equal(document.querySelector('.hccl-error').closest('[role="tabpanel"]').id, 'hccl-codex-settings');
    assert.equal(calls.describe, baseline.describe + 1, 'failed model refresh does not reload settings');
    assertDirtyForm();
    const freshPlan = usage().querySelector('.hccl-usage-plan');
    await act(async () => modelRefresh.click());
    assertRefreshButton(modelRefresh, '刷新模型');
    assertRefreshButton(usageRefresh, '刷新额度');
    assert.equal(document.querySelector('.hccl-error'), null);
    assert.equal(calls.catalog, baseline.catalog + 3);
    assert.equal(calls.describe, baseline.describe + 2);
    assert.equal(calls.accounts.length, 2, 'catalog retry cannot add to the automatic quota query');
    assert.equal(usage().querySelector('.hccl-usage-plan'), freshPlan);
    assertDirtyForm();
    assert.equal(calls.timers, 0);
  }, { modelCatalog: async attempt => attempt === 2 ? pendingModels.promise : attempt === 3 ? failedModels.promise : catalogReady() });
});

test('pending entry reads survive tab switches and collapse without cancellation, remounts or duplicate requests', async () => {
  for (const strict of [false, true]) {
    const pending = deferred();
    await withPanel(async () => pending.promise, async ({ calls, usage, details, showTab, toggleDetails, clickUsage }) => {
      const signal = calls.accounts[0][3];
      const selectors = ['#hccl-codex-details', '#hccl-codex-usage', '#hccl-codex-settings', '.hccl-usage', '.hccl-usage button', '#hccl-model', '#hccl-custom-model', '#hccl-effort'];
      const nodes = selectors.map(selector => document.querySelector(selector));
      const baseline = { describe: calls.describe, catalog: calls.catalog };
      const assertMounted = () => selectors.forEach((selector, index) => assert.equal(document.querySelector(selector), nodes[index], `${selector} is never remounted`));
      const assertPending = () => {
        assertMounted();
        assert.equal(calls.accounts.length, 1);
        assert.equal(signal.aborted, false);
        assert.equal(usage().dataset.state, 'loading');
        assert.equal(usage().getAttribute('aria-busy'), 'true');
        assert.equal(usage().querySelector('button[aria-label="刷新额度"]').disabled, true);
      };
      assert.equal(details().hidden, true);
      assertSelectedTab('settings');
      assert.equal(usage().closest('[hidden]'), document.getElementById('hccl-codex-usage'));
      assertPending();
      await showTab('settings'); assertSelectedTab('settings'); assertPending();
      await showTab('usage'); assertSelectedTab('usage'); assertPending();
      await clickUsage(); assertPending();
      await toggleDetails(); assertPending();
      await toggleDetails(); assertPending();
      await showTab('settings'); await toggleDetails(); assertPending();
      assert.equal(details().hidden, true);
      await act(async () => pending.resolve(ok(ready())));
      assertMounted();
      assert.equal(details().hidden, true, 'a response cannot open the disclosure');
      assertSelectedTab('settings');
      assert.equal(usage().dataset.state, 'ready');
      assert.equal(usage().querySelector('.hccl-usage-plan').textContent, 'Plus');
      assert.equal(signal.aborted, false);
      await toggleDetails();
      assertSelectedTab('settings');
      await showTab('usage');
      assertSelectedTab('usage');
      assertMounted();
      assert.equal(usage().closest('[hidden]'), null);
      assert.equal(calls.accounts.length, 1);
      assert.equal(calls.describe, baseline.describe);
      assert.equal(calls.catalog, baseline.catalog);
      assert.equal(calls.writes.length, 0);
      assert.equal(calls.timers, 0);
    }, { strict });
  }
});

test('the enable switch opens settings from either collapsed details or the usage tab without querying quota again', async () => {
  for (const enabled of [false, true]) {
    await withPanel(async () => ok(ready()), async ({ calls, usage, details, showTab }) => {
      const toggle = document.querySelector('[role="switch"]');
      const usageNode = usage();
      const plan = usageNode.querySelector('.hccl-usage-plan');
      const baseline = { describe: calls.describe, catalog: calls.catalog };
      assert.equal(details().hidden, true);
      assertSelectedTab('settings');
      assert.equal(toggle.checked, enabled);
      assert.equal(toggle.closest('[hidden]'), null);
      await act(async () => toggle.click());
      assert.equal(toggle.checked, !enabled);
      assert.equal(details().hidden, false);
      assertSelectedTab('settings');
      assert.equal(document.querySelector('.hccl-config-button').getAttribute('aria-expanded'), 'true');
      assert.equal(document.getElementById('hccl-model').closest('[hidden]'), null);
      assert(document.querySelector('.hccl-unsaved'));
      await showTab('usage');
      await act(async () => toggle.click());
      assert.equal(toggle.checked, enabled);
      assert.equal(details().hidden, false);
      assertSelectedTab('settings');
      assert.equal(usage(), usageNode);
      assert.equal(usage().querySelector('.hccl-usage-plan'), plan);
      assert.equal(calls.accounts.length, 1);
      assert.equal(calls.describe, baseline.describe);
      assert.equal(calls.catalog, baseline.catalog);
      assert.equal(calls.writes.length, 0);
    }, { enabled });
  }
});

test('settings errors and saved notices belong to the settings panel and never trigger another usage read', async () => {
  let attempts = 0;
  await withPanel(async () => ok(ready()), async ({ dom, calls, usage, details, showTab, toggleDetails }) => {
    const settingsPanel = document.getElementById('hccl-codex-settings');
    const baseline = { describe: calls.describe, catalog: calls.catalog };
    await showTab('settings');
    const model = document.getElementById('hccl-model');
    const save = [...settingsPanel.querySelectorAll('button')].find(button => button.textContent === '保存配置');
    await act(async () => { model.value = 'custom-model'; model.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    await act(async () => save.click());
    const error = document.querySelector('.hccl-error');
    assert(error);
    assert.equal(error.getAttribute('role'), 'alert');
    assert.match(error.textContent, /模拟配置冲突/);
    assert.match(error.textContent, /重新进入此页面获取最新配置/);
    assert.match(error.textContent, /未保存的更改会丢失/);
    assert.doesNotMatch(error.textContent, /重新载入/);
    assert.equal([...settingsPanel.querySelectorAll('button')].some(button => button.textContent === '重新载入'), false);
    assert.equal(calls.writes.length, 1, 'a conflict must not auto-retry or overwrite the saved configuration');
    assert.equal(calls.writes[0].revision, 'r1', 'revision checking is preserved without a reload button');
    assert.equal(error.closest('[role="tabpanel"]'), settingsPanel);
    assert.equal(error.closest('[hidden]'), null);
    assert.equal(model.value, 'custom-model');
    assert.equal(save.disabled, false);
    await showTab('usage');
    assert.equal(error.closest('[hidden]'), settingsPanel);
    assert.equal(usage().querySelector('.hccl-error, .hccl-ok'), null);
    await toggleDetails(); await showTab('settings');
    assert.equal(document.querySelector('.hccl-error'), error);
    assert.equal(error.closest('[hidden]'), null);
    await act(async () => save.click());
    assert.equal(document.querySelector('.hccl-error'), null);
    const notice = document.querySelector('.hccl-ok');
    assert(notice);
    assert.equal(notice.getAttribute('role'), 'status');
    assert.match(notice.textContent, /已保存/);
    assert.equal(notice.closest('[role="tabpanel"]'), settingsPanel);
    assert.equal(save.disabled, true);
    await showTab('usage');
    assert.equal(notice.closest('[hidden]'), settingsPanel);
    await toggleDetails();
    assert.equal(details().hidden, true);
    assert.equal(document.querySelector('.hccl-ok'), notice);
    assert.equal(calls.accounts.length, 1);
    assert.equal(calls.describe, baseline.describe);
    assert.equal(calls.catalog, baseline.catalog);
    assert.equal(calls.writes.length, 2);
    assert.equal(calls.timers, 0);
  }, { settingsUpdate: async (ns, value) => ++attempts === 1
    ? { ok: false, error: { code: 'conflict', message: '模拟配置冲突' } }
    : ok({ ns, value: { ...value }, revision: 'r2' }) });
});

test('opening the page auto-loads empty usage once, including StrictMode, without polling or duplicate renders', async () => {
  for (const strict of [false, true]) {
    const pending = deferred();
    await withPanel(async () => pending.promise, async ({ calls, usage, clickUsage, rerender, settingsEvent }) => {
      assert.equal(calls.accounts.length, 1);
      assert.equal(calls.timers, 0);
      assertSelectedTab('settings');
      assert.equal(document.getElementById('hccl-codex-details').hidden, true);
      assert.equal(document.getElementById('hccl-codex-settings').hidden, false);
      assert.equal(document.getElementById('hccl-model').closest('[hidden]'), document.getElementById('hccl-codex-details'));
      assert.equal(usage().closest('.hccl-provider-details'), document.getElementById('hccl-codex-details'), 'usage remains mounted inside the shared collapsed disclosure');
      assert.equal(usage().closest('[hidden]'), document.getElementById('hccl-codex-usage'), 'the inactive usage tab loads automatically without being selected');
      assert.equal(document.getElementById('hccl-codex-usage').hidden, true);
      assert.equal(usage().dataset.state, 'loading');
      assert.equal(usage().getAttribute('aria-busy'), 'true');
      assert.equal(usage().querySelector('h3').textContent, '套餐与额度');
      assertRefreshButton(usage().querySelector('button[aria-label="刷新额度"]'), '刷新额度', true);
      assert.equal(usage().querySelector('button[aria-label="刷新额度"]').disabled, true);
      assert.equal(usage().querySelector('.hccl-usage-plan, .hccl-usage-bucket, .hccl-usage-reset-cards'), null);
      const status = usage().querySelector('[role="status"]');
      assert.equal(status.textContent, '正在查询…');
      assert.equal(status.className, 'hccl-usage-status');
      assert.equal(status.getAttribute('aria-live'), 'polite');
      assert.equal(status.getAttribute('aria-atomic'), 'true');
      const [path, method, payload, signal] = calls.accounts[0];
      assert.equal(path, '/harness-codex-cli-link');
      assert.equal(method, 'accountUsage');
      assert.equal(JSON.stringify(payload), '{}');
      assert(signal instanceof AbortSignal);
      assert.equal(signal.aborted, false);
      const configure = document.querySelector('.hccl-config-button');
      await act(async () => configure.click());
      await act(async () => configure.click());
      await settingsEvent(); await rerender(); await clickUsage();
      assert.equal(calls.accounts.length, 1, 'pending automatic reads cannot be duplicated');
      await act(async () => pending.resolve(ok(ready())));
      assert.equal(usage().dataset.state, 'ready');
      assert.equal(usage().getAttribute('aria-busy'), 'false');
      assert.equal(usage().querySelector('.hccl-usage-plan').textContent, 'Plus');
      assertRefreshButton(usage().querySelector('button[aria-label="刷新额度"]'), '刷新额度');
      assert.equal(usage().querySelector('[role="status"]').textContent, '额度已更新。');
      assert.equal(usage().querySelector('[role="status"]').className, 'hccl-sr-only');
      await settingsEvent(); await rerender(); await rerender();
      assert.equal(calls.accounts.length, 1, 'loaded usage is not queried again on rerenders or configuration events');
      await clickUsage();
      assert.equal(calls.accounts.length, 2, 'manual refresh remains available');
      assert.equal(calls.writes.length, 0);
      assert.equal(calls.timers, 0);
      assert.equal(document.getElementById('hccl-codex-settings').hidden, true);
      assert.equal(usage().querySelectorAll('button').length, 1, 'there is no login or redemption action');
    }, { strict });
  }
});

test('failed or non-ready automatic reads do not loop, and reopening the page tries once again', async () => {
  for (const [failure, state] of [
    [new Error('RAW_SECRET_AUTO_FAILURE'), 'connectionError'],
    [ok({ ...ready(), state: 'signedOut', usage: null }), 'signedOut'],
    [ok({ ...ready(), state: 'unsupported', usage: null }), 'unsupported'],
    [ok({ ...ready(), state: 'unverified', usage: null }), 'unverified'],
    [ok(null), 'invalidResponse'],
  ]) {
    let attempt = 0;
    await withPanel(async () => {
      if (++attempt > 1) return ok(newAccountReady());
      if (failure instanceof Error) throw failure;
      return failure;
    }, async ({ calls, usage, unmount, mount, rerender, settingsEvent }) => {
      assert.equal(calls.accounts.length, 1);
      assert.equal(usage().dataset.state, state);
      assert.equal(usage().querySelector('.hccl-usage-plan, .hccl-usage-bucket, .hccl-usage-reset-cards'), null);
      assert.equal(usage().querySelector('button[aria-label="刷新额度"]').disabled, false);
      await settingsEvent(); await rerender(); await rerender();
      assert.equal(calls.accounts.length, 1, 'a missing snapshot after failure must not create a retry loop');
      assert.doesNotMatch(document.body.innerHTML, /RAW_SECRET_AUTO_FAILURE/);
      await unmount(); await mount();
      assert.equal(calls.accounts.length, 2);
      assert.equal(usage().dataset.state, 'ready');
      assert.equal(usage().querySelector('.hccl-usage-plan').textContent, 'Pro');
      assert.equal(calls.writes.length, 0);
      assert.equal(calls.timers, 0);
    }, { strict: true });
  }
});

test('leaving the page drops its snapshot so a new entry reads the current account rather than a cached quota', async () => {
  let attempt = 0;
  await withPanel(async () => ok(++attempt === 1 ? ready() : newAccountReady()), async ({ calls, usage, unmount, mount, rerender }) => {
    assert.equal(calls.accounts.length, 1);
    assert.equal(usage().querySelector('.hccl-usage-plan').textContent, 'Plus');
    await rerender();
    assert.equal(calls.accounts.length, 1);
    await unmount(); await mount();
    assert.equal(calls.accounts.length, 2);
    assert.equal(usage().querySelector('.hccl-usage-plan').textContent, 'Pro');
    assert.equal(usage().querySelector('.hccl-usage-count strong').textContent, '2');
    assert.doesNotMatch(usage().textContent, /Plus|Codex 默认|有效期未知/);
    assert.equal(calls.writes.length, 0);
  });
});

test('ready snapshot preserves separate buckets, true used percentages, null/zero and compact local reset dates', async () => {
  await withPanel(async () => ok(ready()), async ({ usage, clickUsage }) => {
    assert.equal(usage().dataset.state, 'ready');
    const plan = usage().querySelector('.hccl-usage-plan');
    assert.equal(plan.getAttribute('aria-label'), '套餐类型');
    assert.equal(plan.textContent, 'Plus');
    const buckets = usage().querySelectorAll('.hccl-usage-bucket');
    assert.equal(buckets.length, 2);
    assert.deepEqual([...buckets].map(bucket => bucket.getAttribute('aria-label')), ['Codex 默认', '代码审核']);
    assert.deepEqual([...buckets].map(bucket => bucket.querySelector('h4').textContent), ['Codex 默认', '代码审核']);
    assert.deepEqual([...usage().querySelectorAll('.hccl-usage-window h5')].map(node => node.textContent), ['5 小时限额', '每周限额', '90 分钟限额', '2 天限额']);
    const bars = usage().querySelectorAll('[role="progressbar"]');
    assert.equal(bars.length, 4);
    assert.deepEqual([...bars].map(bar => bar.getAttribute('aria-label')), ['Codex 默认 · 5 小时限额', 'Codex 默认 · 每周限额', '代码审核 · 90 分钟限额', '代码审核 · 2 天限额']);
    for (const bar of bars) {
      assert.equal(bar.getAttribute('aria-valuemin'), '0');
      assert.equal(bar.getAttribute('aria-valuemax'), '100');
    }
    assert.equal(bars[0].getAttribute('aria-valuenow'), '12.5');
    assert.equal(bars[0].getAttribute('aria-valuetext'), '已用 12.5%');
    assert.equal(bars[0].firstChild.style.width, '12.5%');
    assert.equal(bars[0].dataset.unknown, 'false');
    assert.equal(bars[1].getAttribute('aria-valuenow'), '0');
    assert.equal(bars[1].getAttribute('aria-valuetext'), '已用 0%');
    assert.equal(bars[1].firstChild.style.width, '0%');
    assert.equal(bars[2].hasAttribute('aria-valuenow'), false, 'null is indeterminate, not zero');
    assert.equal(bars[2].getAttribute('aria-valuetext'), '已用比例：未提供');
    assert.equal(bars[2].dataset.unknown, 'true');
    assert.equal(bars[2].querySelector('.hccl-usage-fill'), null);
    assert.equal(bars[3].getAttribute('aria-valuenow'), '100');
    assert.equal(bars[3].getAttribute('aria-valuetext'), '已用 125.25%');
    assert.equal(bars[3].firstChild.style.width, '100%');
    assert.deepEqual([...usage().querySelectorAll('.hccl-usage-percent')].map(node => node.textContent), ['已用 12.5%', '已用 0%', '已用比例：未提供', '已用 125.25%']);
    assert.deepEqual([...usage().querySelectorAll('.hccl-usage-reset')].map(node => node.textContent), [
      `重置：${localDate(1793757600)}`, '重置：未提供', `重置：${localDate(0)}`, `重置：${localDate(1793923200)}`,
    ], 'dates use Unix seconds, including zero, and local minutes with a time-zone offset');
    assert.doesNotMatch(usage().textContent, /[$¥￥€]|本地时区：|重置时间即使已过去/);
    assert.equal(usage().querySelector('.hccl-usage-count strong').textContent, '7');
    assert.equal(usage().querySelectorAll('.hccl-usage-detail').length, 3, 'backend count is not the available detail length');
  });
});

test('reset card count preserves the backend decimal string and empty details add no redundant text', async () => {
  for (const [credits, count] of [
    [{ availableCount: '9', details: null }, '9'],
    [{ availableCount: '9', details: [] }, '9'],
    [{ availableCount: '0', details: [] }, '0'],
    [{ availableCount: '9007199254740993', details: [] }, '9007199254740993'],
    [{ availableCount: '0007', details: [] }, '0007'],
    [null, '未提供'],
    [undefined, '未提供'],
  ]) {
    const snapshot = ready(); snapshot.usage.resetCredits = credits;
    await withPanel(async () => ok(snapshot), async ({ usage, clickUsage }) => {
      const cards = usage().querySelector('.hccl-usage-reset-cards');
      assert.equal(cards.getAttribute('aria-label'), '重置额度卡');
      assert.equal(cards.querySelector('.hccl-usage-count strong').textContent, count);
      assert.equal(cards.textContent, `重置额度卡可用 ${count}`, 'null and [] show only the supplied count, never an inferred zero or explanation');
      assert.equal(cards.querySelector('ul, .hccl-usage-detail, button, details'), null);
    });
  }
});

test('reset card count never comes from detail length and a zero count suppresses even available rows', async () => {
  const details = ready().usage.resetCredits.details;
  for (const [count, rows] of [['1', 3], ['17', 3], ['9007199254740993', 3], ['0', 0]]) {
    const snapshot = ready(); snapshot.usage.resetCredits = { availableCount: count, details };
    await withPanel(async () => ok(snapshot), async ({ usage, clickUsage }) => {
      const cards = usage().querySelector('.hccl-usage-reset-cards');
      assert.equal(cards.querySelector('.hccl-usage-count strong').textContent, count);
      assert.equal(cards.querySelectorAll('.hccl-usage-detail').length, rows);
      if (count === '0') {
        assert.equal(cards.querySelector('ul'), null);
        assert.equal(cards.textContent, '重置额度卡可用 0');
        assert.doesNotMatch(cards.textContent, /有效期未知|不过期卡|有到期时间/);
      }
    });
  }
});

test('invalid reset counts remain unknown rather than being coerced or derived from available rows', async () => {
  for (const count of [null, undefined, 0, 3, -1, '', ' 7 ', '-1', '1.5', '1e3', 'NaN']) {
    const snapshot = ready(); snapshot.usage.resetCredits.availableCount = count;
    await withPanel(async () => ok(snapshot), async ({ usage, clickUsage }) => {
      const cards = usage().querySelector('.hccl-usage-reset-cards');
      assert.equal(cards.querySelector('.hccl-usage-count strong').textContent, '未提供');
      assert.equal(cards.querySelectorAll('.hccl-usage-detail').length, 3, 'a missing count is not a known zero');
    });
  }
});

test('only available reset cards show their title and known, unknown or absent expiry without history or actions', async () => {
  const snapshot = ready();
  snapshot.usage.resetCredits.details.push(
    { type: 'codexRateLimits', status: 'available', title: ' ', expiryKnown: true, expiresAt: 0 },
    { type: 'unknown-card-type', status: 'available', title: null, expiryKnown: true, expiresAt: null },
    { type: 'codexRateLimits', status: 'available', title: '未提供有效期标识', expiresAt: null },
    { type: 'codexRateLimits', status: 'available', title: '未知标识不反推日期', expiryKnown: false, expiresAt: null },
    { type: 'codexRateLimits', status: 'UNKNOWN_STATUS', title: '未识别状态卡', expiryKnown: true, expiresAt: null },
    { type: 'codexRateLimits', title: '缺失状态卡', expiryKnown: true, expiresAt: null },
    null,
  );
  await withPanel(async () => ok(snapshot), async ({ usage, clickUsage }) => {
    const cards = usage().querySelector('.hccl-usage-reset-cards');
    const rows = [...cards.querySelectorAll('.hccl-usage-detail')];
    assert.equal(cards.querySelector('ul').getAttribute('aria-label'), '返回的可用重置卡');
    assert.deepEqual(rows.map(row => row.querySelector('strong').textContent), ['有效期未知', '不过期卡', '有到期时间', '额度重置', '重置卡', '未提供有效期标识', '未知标识不反推日期']);
    assert.deepEqual(rows.map(row => row.querySelector('.hccl-usage-expiry').textContent), [
      '到期时间未提供', '不过期', `将于 ${localDate(1793923200)} 到期`, `将于 ${localDate(0)} 到期`, '不过期', '到期时间未提供', '到期时间未提供',
    ]);
    for (const row of rows) {
      assert.equal(row.children.length, 2, 'only title/type and expiry are rendered');
      assert.equal(row.textContent, row.querySelector('strong').textContent + row.querySelector('.hccl-usage-expiry').textContent);
    }
    assert.doesNotMatch(cards.textContent, /正在兑换卡|已使用历史卡|已过期历史卡|未识别状态卡|缺失状态卡|HIDDEN_RESET|123456789|codexRateLimits|available|redeeming|redeemed|expired|获得时间|状态|描述|历史|使用/);
    assert.equal(cards.querySelector('button, a, details, summary, dl'), null);
    assert.equal(usage().querySelectorAll('button').length, 1, 'refresh is the only usage action');
  });
});

test('Full reset card title is localized without changing other server titles or snapshot data', async () => {
  const titles = ['Full reset', 'Full Reset', 'full reset', ' Full reset ', '完全重置', 'Partial reset', 'Full reset bonus'];
  const snapshot = ready();
  snapshot.usage.resetCredits = {
    availableCount: String(titles.length),
    details: titles.map(title => ({ type: 'codexRateLimits', status: 'available', title, expiryKnown: true, expiresAt: null })),
  };
  await withPanel(async () => ok(snapshot), async ({ calls, usage, clickUsage }) => {
    await clickUsage();
    assert.deepEqual([...usage().querySelectorAll('.hccl-usage-detail strong')].map(node => node.textContent),
      ['完全重置', '完全重置', '完全重置', '完全重置', '完全重置', 'Partial reset', 'Full reset bonus']);
    assert.deepEqual(snapshot.usage.resetCredits.details.map(detail => detail.title), titles);
    assert.equal(calls.writes.length, 0);
    assert.equal(usage().querySelectorAll('button').length, 1, 'refresh is still the only action');
  });
});

test('refresh immediately clears old plan, quotas and cards, blocks concurrent calls and hides transport/RemoteResult secrets', async () => {
  const pending = deferred();
  let attempt = 0;
  await withPanel(async () => {
    ++attempt;
    if (attempt === 1) return ok(ready());
    if (attempt === 2) return pending.promise;
    if (attempt === 3) return { ok: false, error: { message: 'RAW_SECRET_REMOTE_RESULT_token_123', code: 'PRIVATE' } };
    return ok(newAccountReady());
  }, async ({ calls, usage, clickUsage, showTab }) => {
    assert.equal(calls.accounts.length, 1, 'the initial snapshot is loaded automatically');
    await showTab('usage');
    assert.equal(usage().querySelector('.hccl-usage-plan').textContent, 'Plus');
    assert.match(usage().textContent, /Codex 默认|已用 12\.5%|有效期未知/);
    const refresh = usage().querySelector('button[aria-label="刷新额度"]');
    await act(async () => { refresh.click(); refresh.click(); });
    assert.equal(usage().dataset.state, 'loading');
    assert.equal(usage().getAttribute('aria-busy'), 'true');
    assert.equal(usage().querySelector('button[aria-label="刷新额度"]').disabled, true);
    assertRefreshButton(usage().querySelector('button[aria-label="刷新额度"]'), '刷新额度', true);
    assert.equal(usage().querySelector('[role="status"]').textContent, '正在查询…');
    assert.equal(usage().querySelector('[role="status"]').className, 'hccl-usage-status');
    assert.equal(usage().querySelector('.hccl-usage-plan, .hccl-usage-bucket, .hccl-usage-reset-cards, [role="progressbar"]'), null);
    assert.doesNotMatch(usage().textContent, /Plus|Codex 默认|12\.5%|有效期未知/);
    await clickUsage();
    assert.equal(calls.accounts.length, 2, 'neither same-turn clicks nor a disabled busy button can duplicate refresh');
    await act(async () => pending.reject(new Error('RAW_SECRET_TRANSPORT_Bearer_abc')));
    assert.equal(usage().dataset.state, 'connectionError');
    assert.equal(usage().getAttribute('aria-busy'), 'false');
    assert.equal(usage().querySelector('[role="status"]').textContent, '额度接口连接失败，请稍后刷新。');
    assert.equal(usage().querySelector('button[aria-label="刷新额度"]').disabled, false);
    assertRefreshButton(usage().querySelector('button[aria-label="刷新额度"]'), '刷新额度');
    assert.equal(usage().querySelector('.hccl-usage-plan, .hccl-usage-bucket, .hccl-usage-reset-cards'), null);
    assert.doesNotMatch(document.body.innerHTML, /RAW_SECRET|Bearer_abc|Plus|Codex 默认|12\.5%|有效期未知/);
    await clickUsage();
    assert.equal(usage().dataset.state, 'unavailable');
    assert.equal(usage().querySelector('[role="status"]').textContent, '额度暂不可用，请稍后刷新。');
    assert.doesNotMatch(document.body.innerHTML, /RAW_SECRET|PRIVATE|Plus|Codex 默认|12\.5%|有效期未知/);
    await clickUsage();
    assert.equal(usage().dataset.state, 'ready');
    assert.equal(usage().querySelector('.hccl-usage-plan').textContent, 'Pro');
    assert.equal(usage().querySelector('.hccl-usage-bucket').getAttribute('aria-label'), '新账号额度');
    assert.equal(usage().querySelector('[role="progressbar"]').getAttribute('aria-valuetext'), '已用 63.75%');
    assert.equal(usage().querySelector('.hccl-usage-count strong').textContent, '2');
    assert.equal(usage().querySelector('.hccl-usage-detail strong').textContent, '新账号重置卡');
    assert.doesNotMatch(usage().textContent, /Plus|Codex 默认|12\.5%|有效期未知/);
    assert.equal(calls.accounts.length, 4);
    assert.equal(calls.writes.length, 0);
    assert.equal(calls.timers, 0);
  });
});

test('signed-out, changed, unavailable, unverified and unsupported states clear stale plans and quotas without inventing zeros', async () => {
  const messages = {
    signedOut: '尚未登录 ChatGPT 账号。', changed: '账号状态已变化，请重新刷新。', unavailable: '额度暂不可用，请稍后刷新。',
    unverified: '暂时无法确认账号，请稍后刷新。', unsupported: '当前账号不支持额度查询。',
  };
  for (const [state, type, expected] of [
    ['signedOut', 'chatgpt', 'signedOut'], ['changed', 'chatgpt', 'changed'], ['unavailable', 'chatgpt', 'unavailable'], ['unverified', 'unknown', 'unverified'],
    ['unsupported', 'apiKey', 'unsupported'], ['unsupported', 'amazonBedrock', 'unsupported'], ['unsupported', 'gcp', 'unsupported'], ['unsupported', 'unknown', 'unsupported'],
    ['ready', 'apiKey', 'unsupported'], ['ready', 'amazonBedrock', 'unsupported'], ['ready', 'gcp', 'unsupported'], ['ready', 'unknown', 'unverified'],
    ['ready', undefined, 'unverified'],
  ]) {
    const snapshot = ready(); snapshot.state = state; snapshot.account.type = type; snapshot.message = 'RAW_SECRET_FROM_DTO';
    let attempt = 0;
    await withPanel(async () => ok(++attempt === 1 ? ready() : snapshot), async ({ usage, clickUsage }) => {
      assert.equal(usage().querySelector('.hccl-usage-plan').textContent, 'Plus');
      assert.equal(usage().querySelectorAll('[role="progressbar"]').length, 4);
      assert.equal(usage().querySelector('.hccl-usage-detail strong').textContent, '有效期未知');
      await clickUsage();
      assert.equal(usage().dataset.state, expected, `${state}/${type}`);
      assert.equal(usage().querySelector('.hccl-usage-plan'), null);
      assert.equal(usage().querySelector('.hccl-usage-bucket'), null);
      assert.equal(usage().querySelector('.hccl-usage-reset-cards'), null);
      assert.equal(usage().querySelector('[role="progressbar"]'), null);
      assert.equal(usage().querySelector('[role="status"]').textContent, messages[expected]);
      assert.equal(usage().querySelector('[role="status"]').className, 'hccl-usage-status');
      assert.equal(usage().querySelector('button[aria-label="刷新额度"]').disabled, false);
      assert.equal(usage().getAttribute('aria-busy'), 'false');
      assert.doesNotMatch(usage().textContent, /Plus|Codex 默认|12\.5%|有效期未知|已用 0%|可用 0|RAW_SECRET|12345678901234567890|r\*\*\*@example.test/);
    });
  }
});

test('unknown or malformed DTO and RemoteResult structures report incompatibility with only fixed safe wording', async () => {
  for (const result of [
    ok(null), ok(undefined), ok({ ...ready(), version: 2 }), ok({ ...ready(), version: '1' }), ready(), null, undefined, [], 'RAW_SECRET',
    {}, { ok: 'true', value: ready() }, { ok: 1, value: ready() }, { ok: true },
    { ok: false }, { ok: false, error: null }, { ok: false, error: 'RAW_SECRET' },
    { ok: false, error: { message: 'RAW_SECRET' } }, { ok: false, error: { code: 'codex/not-found' } },
    { ok: false, error: { code: 404, message: 'RAW_SECRET' } }, { ok: false, error: { code: 'codex/forbidden', message: {} } },
    Object.create({ ok: true, value: ready() }), Object.assign(Object.create({ value: ready() }), { ok: true }),
    { ok: false, error: Object.assign(Object.create({ code: 'codex/not-found' }), { message: 'RAW_SECRET' }) },
    { ok: false, error: Object.assign(Object.create({ message: 'RAW_SECRET' }), { code: 'codex/forbidden' }) },
    Object.assign([], { ok: true, value: ready() }), ok(Object.assign([], ready())),
    ok(Object.create({ version: 1, state: 'ready', account: ready().account, usage: ready().usage })),
    { ok: true, value: { version: 1, state: '__proto__', message: 'RAW_SECRET' } },
    { ok: true, value: { version: 1, state: 'constructor', message: 'RAW_SECRET' } },
    { ok: true, value: { version: 1, state: 'futureState', message: 'RAW_SECRET' } },
    { ok: true, value: { version: 1, state: ['ready'], message: 'RAW_SECRET' } },
    { ok: true, value: { version: 1, message: 'RAW_SECRET' } },
  ]) {
    let attempt = 0;
    await withPanel(async () => ++attempt === 1 ? ok(ready()) : result, async ({ usage, clickUsage }) => {
      assert.equal(usage().querySelector('.hccl-usage-plan').textContent, 'Plus');
      await clickUsage();
      assert.equal(usage().dataset.state, 'invalidResponse');
      assert.equal(usage().querySelector('.hccl-usage-plan, .hccl-usage-bucket, .hccl-usage-reset-cards, [role="progressbar"]'), null);
      assert.equal(usage().querySelector('[role="status"]').textContent, '额度接口响应不兼容，请更新插件。');
      assert.equal(usage().querySelector('button[aria-label="刷新额度"]').disabled, false);
      assert.equal(usage().getAttribute('aria-busy'), 'false');
      assert.doesNotMatch(document.body.innerHTML, /RAW_SECRET|Plus|Codex 默认|12\.5%|有效期未知/);
    });
  }
});

test('RemoteResult failure codes use only the recognized safe categories and never expose raw code or message', async () => {
  for (const [code, state, message] of [
    ['codex/not-found', 'endpointUnavailable', '额度接口未就绪，请确认插件已正确加载。'],
    ['codex/forbidden', 'forbidden', '当前连接无权查看账号额度。'],
    ['codex/unavailable', 'unavailable', '额度暂不可用，请稍后刷新。'],
    ['RAW_SECRET_UNKNOWN_CODE', 'unavailable', '额度暂不可用，请稍后刷新。'],
    ['codex/not-found RAW_SECRET', 'unavailable', '额度暂不可用，请稍后刷新。'],
    ['forbidden', 'unavailable', '额度暂不可用，请稍后刷新。'],
    ['404', 'unavailable', '额度暂不可用，请稍后刷新。'],
    ['', 'unavailable', '额度暂不可用，请稍后刷新。'],
  ]) {
    let attempt = 0;
    await withPanel(async () => ++attempt === 1 ? ok(ready()) : {
      ok: false, usageState: 'ready', value: ready(),
      error: { code, message: 'RAW_SECRET_Bearer_TOKEN<img src=x onerror="globalThis.LEAK=true">', usageState: 'ready', state: 'ready' },
    }, async ({ calls, usage, clickUsage }) => {
      assert.equal(calls.accounts.length, 1);
      assert.equal(usage().querySelector('.hccl-usage-plan').textContent, 'Plus');
      await clickUsage();
      assert.equal(usage().dataset.state, state, code);
      assert.equal(usage().querySelector('[role="status"]').textContent, message);
      assert.equal(usage().querySelector('[role="status"]').className, 'hccl-usage-status');
      assert.equal(usage().querySelector('.hccl-usage-plan, .hccl-usage-bucket, .hccl-usage-reset-cards, [role="progressbar"], img'), null);
      assert.equal(usage().getAttribute('aria-busy'), 'false');
      assert.equal(usage().querySelector('button[aria-label="刷新额度"]').disabled, false);
      assertRefreshButton(usage().querySelector('button[aria-label="刷新额度"]'), '刷新额度');
      assert.doesNotMatch(document.body.innerHTML, /RAW_SECRET|Bearer_TOKEN|codex\/not-found|codex\/forbidden|codex\/unavailable|Plus|Codex 默认|12\.5%|有效期未知/);
      assert.equal(calls.accounts.length, 2);
      assert.equal(calls.writes.length, 0);
      assert.equal(calls.timers, 0);
    });
  }
});

test('only the exact current-channel carrier HTTP errors classify as endpoint unavailable or forbidden and retries recover', async () => {
  for (const [status, state, message] of [
    [404, 'endpointUnavailable', '额度接口未就绪，请确认插件已正确加载。'],
    [405, 'endpointUnavailable', '额度接口未就绪，请确认插件已正确加载。'],
    [401, 'forbidden', '当前连接无权查看账号额度。'],
    [403, 'forbidden', '当前连接无权查看账号额度。'],
  ]) {
    let attempt = 0;
    const error = Object.assign(new Error(`transport failure for /harness-codex-cli-link/accountUsage: HTTP ${status}`), {
      usageState: 'ready', code: 'RAW_SECRET_CODE', detail: 'RAW_SECRET_Bearer_TOKEN',
    });
    await withPanel(async () => {
      if (++attempt === 1) return ok(ready());
      if (attempt === 2) throw error;
      return ok(newAccountReady());
    }, async ({ calls, usage, clickUsage }) => {
      assert.equal(calls.accounts.length, 1);
      assert.equal(usage().querySelector('.hccl-usage-plan').textContent, 'Plus');
      await clickUsage();
      assert.equal(usage().dataset.state, state);
      assert.equal(usage().querySelector('[role="status"]').textContent, message);
      assert.equal(usage().querySelector('.hccl-usage-plan, .hccl-usage-bucket, .hccl-usage-reset-cards, [role="progressbar"]'), null);
      assert.equal(usage().getAttribute('aria-busy'), 'false');
      assert.equal(usage().querySelector('button[aria-label="刷新额度"]').disabled, false);
      assert.doesNotMatch(document.body.innerHTML, /transport failure|HTTP 40[1345]|RAW_SECRET|Bearer_TOKEN|Plus|Codex 默认|12\.5%|有效期未知/);
      await clickUsage();
      assert.equal(usage().dataset.state, 'ready');
      assert.equal(usage().querySelector('.hccl-usage-plan').textContent, 'Pro');
      assert.equal(usage().querySelector('[role="progressbar"]').getAttribute('aria-valuetext'), '已用 63.75%');
      assert.equal(usage().querySelector('[role="status"]').textContent, '额度已更新。');
      assert.equal(usage().querySelector('[role="status"]').className, 'hccl-sr-only');
      assert.equal(calls.accounts.length, 3);
      assert.equal(calls.writes.length, 0);
      assert.equal(calls.timers, 0);
    });
  }
});

test('other transport rejections ignore injected usageState, code, status and near-matching HTTP text', async () => {
  const exact = 'transport failure for /harness-codex-cli-link/accountUsage: HTTP 404';
  for (const error of [
    new Error('RAW_SECRET_TRANSPORT_Bearer_TOKEN'),
    new Error('transport failure for /another-plugin/accountUsage: HTTP 404'),
    new Error('transport failure for /harness-codex-cli-link/otherMethod: HTTP 403'),
    new Error(`${exact} RAW_SECRET`), new Error(`${exact}\n`), new Error(`RAW_SECRET ${exact}`),
    new Error('HTTP 404'), new Error('transport failure for /harness-codex-cli-link/accountUsage: HTTP 500'),
    new Error('transport failure for /harness-codex-cli-link/accountUsage: HTTP 4040'),
    Object.assign(new Error('RAW_SECRET'), { usageState: 'ready', code: 'codex/not-found', status: 404 }),
    { usageState: 'endpointUnavailable', code: 'codex/not-found', status: 404, message: 'RAW_SECRET' },
    { usageState: 'forbidden', code: 'codex/forbidden', status: 403 },
    { usageState: '<script>RAW_SECRET</script>', message: 'RAW_SECRET' },
    { message: 'RAW_SECRET', cause: { message: exact } },
    { get message() { throw new Error('RAW_SECRET_MESSAGE_GETTER'); } },
    { message: { toString() { return exact; } } },
    exact, 'RAW_SECRET', null, undefined, 404,
  ]) {
    let attempt = 0;
    await withPanel(async () => {
      if (++attempt === 1) return ok(ready());
      throw error;
    }, async ({ calls, usage, clickUsage }) => {
      assert.equal(calls.accounts.length, 1);
      assert.equal(usage().querySelector('.hccl-usage-plan').textContent, 'Plus');
      await clickUsage();
      assert.equal(usage().dataset.state, 'connectionError');
      assert.equal(usage().querySelector('[role="status"]').textContent, '额度接口连接失败，请稍后刷新。');
      assert.equal(usage().querySelector('[role="status"]').className, 'hccl-usage-status');
      assert.equal(usage().querySelector('.hccl-usage-plan, .hccl-usage-bucket, .hccl-usage-reset-cards, [role="progressbar"], script'), null);
      assert.equal(usage().getAttribute('aria-busy'), 'false');
      assert.equal(usage().querySelector('button[aria-label="刷新额度"]').disabled, false);
      assert.doesNotMatch(document.body.innerHTML, /RAW_SECRET|Bearer_TOKEN|transport failure|HTTP 404|codex\/not-found|codex\/forbidden|Plus|12\.5%|有效期未知/);
      assert.equal(calls.accounts.length, 2);
      assert.equal(calls.writes.length, 0);
      assert.equal(calls.timers, 0);
    });
  }
});

test('UI failure and lifecycle states are never accepted as server DTO states', async () => {
  for (const state of ['endpointUnavailable', 'forbidden', 'invalidResponse', 'connectionError', 'idle', 'loading']) {
    let attempt = 0;
    await withPanel(async () => ++attempt === 1 ? ok(ready()) : ok({ ...ready(), state, usageState: 'ready', message: 'RAW_SECRET' }), async ({ usage, clickUsage }) => {
      assert.equal(usage().querySelector('.hccl-usage-plan').textContent, 'Plus');
      await clickUsage();
      assert.equal(usage().dataset.state, 'invalidResponse', state);
      assert.equal(usage().querySelector('[role="status"]').textContent, '额度接口响应不兼容，请更新插件。');
      assert.equal(usage().querySelector('.hccl-usage-plan, .hccl-usage-bucket, .hccl-usage-reset-cards, [role="progressbar"]'), null);
      assert.equal(usage().querySelector('button[aria-label="刷新额度"]').disabled, false);
      assert.equal(usage().getAttribute('aria-busy'), 'false');
      assert.doesNotMatch(document.body.innerHTML, /RAW_SECRET|Plus|12\.5%|有效期未知/);
    });
  }
});

test('response parsing failures cannot spoof transport classifications or choose a UI state', async () => {
  for (const error of [
    Object.assign(new Error('RAW_SECRET_PARSE'), { usageState: 'ready' }),
    new Error('transport failure for /harness-codex-cli-link/accountUsage: HTTP 404'),
    new Error('transport failure for /harness-codex-cli-link/accountUsage: HTTP 403'),
  ]) {
    const result = { ok: true, get value() { throw error; } };
    await withPanel(async () => result, async ({ usage, clickUsage }) => {
      assert.equal(usage().dataset.state, 'invalidResponse');
      assert.equal(usage().querySelector('[role="status"]').textContent, '额度接口响应不兼容，请更新插件。');
      assert.equal(usage().querySelector('.hccl-usage-plan, .hccl-usage-bucket, .hccl-usage-reset-cards, [role="progressbar"]'), null);
      assert.equal(usage().querySelector('button[aria-label="刷新额度"]').disabled, false);
      assert.doesNotMatch(document.body.innerHTML, /RAW_SECRET|transport failure|HTTP 40[34]/);
    });
  }
});

test('unmount aborts the request and late old success or failure cannot replace a remounted plan and quota', async () => {
  for (const late of ['success', 'transport-error', 'remote-error', 'endpoint-transport', 'forbidden-transport', 'endpoint-remote', 'forbidden-remote', 'invalid-response']) {
    const pending = deferred();
    let attempt = 0;
    await withPanel(async () => ++attempt === 1 ? pending.promise : ok(newAccountReady()), async ({ calls, usage, unmount, mount, container, details, showTab, toggleDetails }) => {
      assert.equal(calls.accounts.length, 1, 'StrictMode entry starts exactly one automatic query');
      assert.equal(usage().dataset.state, 'loading');
      assert.equal(usage().querySelector('.hccl-usage-plan, .hccl-usage-bucket, .hccl-usage-reset-cards'), null);
      const signal = calls.accounts[0][3];
      assert.equal(signal.aborted, false);
      await showTab('settings'); await showTab('usage'); await toggleDetails();
      assert.equal(details().hidden, true);
      assert.equal(signal.aborted, false, 'tabs and collapse do not simulate leaving the page');
      assert.equal(calls.accounts.length, 1);
      await unmount();
      assert.equal(signal.aborted, true);
      assert.equal(container.textContent, '');
      await mount();
      assert.equal(calls.accounts.length, 2, 'reopening automatically reads the current account once');
      assert.equal(details().hidden, true, 'a real page remount starts collapsed again');
      assertSelectedTab('settings');
      assert.equal(usage().closest('[hidden]'), document.getElementById('hccl-codex-usage'));
      const assertNewAccount = () => {
        assert.equal(usage().dataset.state, 'ready');
        assert.equal(usage().querySelector('.hccl-usage-plan').textContent, 'Pro');
        assert.equal(usage().querySelector('.hccl-usage-bucket').getAttribute('aria-label'), '新账号额度');
        assert.equal(usage().querySelector('[role="progressbar"]').getAttribute('aria-valuetext'), '已用 63.75%');
        assert.equal(usage().querySelector('.hccl-usage-count strong').textContent, '2');
        assert.equal(usage().querySelector('.hccl-usage-detail strong').textContent, '新账号重置卡');
        assert.equal(usage().querySelector('button[aria-label="刷新额度"]').disabled, false);
        assert.equal(usage().getAttribute('aria-busy'), 'false');
        assert.doesNotMatch(document.body.innerHTML, /RAW_SECRET|Plus|Codex 默认|12\.5%|有效期未知/);
      };
      assertNewAccount();
      await act(async () => {
        if (late === 'transport-error') pending.reject(new Error('RAW_SECRET_LATE_TRANSPORT'));
        else if (late === 'endpoint-transport') pending.reject(new Error('transport failure for /harness-codex-cli-link/accountUsage: HTTP 404'));
        else if (late === 'forbidden-transport') pending.reject(new Error('transport failure for /harness-codex-cli-link/accountUsage: HTTP 403'));
        else if (late === 'remote-error') pending.resolve({ ok: false, error: { code: 'codex/unavailable', message: 'RAW_SECRET_LATE_REMOTE' } });
        else if (late === 'endpoint-remote') pending.resolve({ ok: false, error: { code: 'codex/not-found', message: 'RAW_SECRET_LATE_REMOTE' } });
        else if (late === 'forbidden-remote') pending.resolve({ ok: false, error: { code: 'codex/forbidden', message: 'RAW_SECRET_LATE_REMOTE' } });
        else if (late === 'invalid-response') pending.resolve(ok({ ...ready(), state: 'endpointUnavailable', message: 'RAW_SECRET_LATE_DTO' }));
        else pending.resolve(ok(ready()));
      });
      assertNewAccount();
      assert.equal(calls.accounts.length, 2);
      assert.equal(calls.writes.length, 0);
      assert.equal(calls.timers, 0);
    }, { strict: true });
  }
});

test('loaded usage and dirty settings survive tabs and collapse, and usage reads never reload or write settings', async () => {
  const pending = deferred();
  let attempt = 0;
  await withPanel(async () => ++attempt === 1 ? pending.promise : ok(ready()), async ({ dom, calls, usage, clickUsage, details, showTab, toggleDetails, settingsEvent, rerender }) => {
    assert.equal(calls.accounts.length, 1);
    await showTab('settings');
    const model = document.getElementById('hccl-model');
    const effort = document.getElementById('hccl-effort');
    const custom = document.getElementById('hccl-custom-model');
    const advanced = document.querySelector('.hccl-advanced');
    const save = [...document.getElementById('hccl-codex-settings').querySelectorAll('button')].find(button => button.textContent === '保存配置');
    assert.equal(model.closest('[hidden]'), null);
    await act(async () => { model.value = 'custom-model'; model.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    await act(async () => { effort.value = 'high'; effort.dispatchEvent(new dom.window.Event('change', { bubbles: true })); advanced.open = true; });
    const assertDirtyForm = () => {
      assert.equal(document.getElementById('hccl-model'), model);
      assert.equal(document.getElementById('hccl-effort'), effort);
      assert.equal(document.getElementById('hccl-custom-model'), custom);
      assert.equal(document.querySelector('.hccl-advanced'), advanced);
      assert.equal(model.value, 'custom-model');
      assert.equal(custom.value, 'custom-model');
      assert.equal(effort.value, 'high');
      assert.equal(advanced.open, true, 'native disclosure state is retained with the mounted form');
      assert(document.querySelector('.hccl-unsaved'));
      assert.equal(save.disabled, false);
    };
    const baseline = { describe: calls.describe, catalog: calls.catalog };
    await act(async () => pending.resolve(ok(ready())));
    assertDirtyForm();
    const usageNode = usage();
    const quotaSelector = '.hccl-usage-plan, .hccl-usage-bucket, [role="progressbar"], .hccl-usage-reset-cards';
    const quotaNodes = [...usageNode.querySelectorAll(quotaSelector)];
    const assertRetained = () => {
      assertDirtyForm();
      assert.equal(usage(), usageNode);
      const current = [...usage().querySelectorAll(quotaSelector)];
      assert.equal(current.length, quotaNodes.length);
      current.forEach((node, index) => assert.equal(node, quotaNodes[index], 'loaded quota DOM remains mounted'));
      assert.equal(usage().dataset.state, 'ready');
      assert.equal(calls.accounts.length, 1, 'switching tabs and folding the card must not query usage again');
    };
    assertSelectedTab('settings');
    await showTab('usage'); assertRetained();
    await toggleDetails();
    assert.equal(details().hidden, true); assertRetained();
    await toggleDetails(); assertSelectedTab('usage'); assertRetained();
    await showTab('settings'); assertRetained();
    await toggleDetails(); assertRetained();
    await showTab('settings'); assertSelectedTab('settings'); assertRetained();
    await settingsEvent(); await rerender(); assertRetained();
    assert.equal(calls.describe, baseline.describe);
    assert.equal(calls.catalog, baseline.catalog);
    assert.equal(calls.writes.length, 0);
    await clickUsage(); await clickUsage();
    assertDirtyForm();
    assert.equal(calls.describe, baseline.describe);
    assert.equal(calls.catalog, baseline.catalog);
    assert.equal(calls.writes.length, 0);
    assert.equal(usage().querySelector('.hccl-usage-plan').textContent, 'Plus');
    assert.equal(usage().querySelector('[role="progressbar"]').getAttribute('aria-valuetext'), '已用 12.5%');
    assert.equal(usage().querySelector('.hccl-usage-account'), null);
    await showTab('settings');
    assert.equal(save.closest('[hidden]'), null);
    await act(async () => save.click());
    assert.equal(calls.writes.length, 1);
    assert.deepEqual(calls.writes[0], { ns: 'harness-codex-cli-link', revision: 'r1', value: { enabled: true, model: 'custom-model', reasoningEffort: 'high' } });
    assert.equal(calls.accounts.length, 3, 'saving settings cannot trigger another account query');
  });
});

test('compact UI omits account identity, workspaces, ordinary credits, eligibility, checked time and historical metadata', async () => {
  for (const [allowed, used] of [[true, 120], [false, 0], [null, 0]]) {
    const snapshot = ready(); snapshot.usage.ordinaryUsageAllowed = allowed; snapshot.usage.rateLimits[0].primary.usedPercent = used;
    snapshot.message = 'RAW_SECRET_SNAPSHOT_MESSAGE';
    await withPanel(async () => ok(snapshot), async ({ usage, clickUsage }) => {
      assert.equal(usage().querySelector('.hccl-usage-plan').textContent, 'Plus');
      assert.equal(usage().querySelector('[role="progressbar"]').getAttribute('aria-valuetext'), `已用 ${used}%`, 'hidden eligibility never overrides the reported percentage');
      assert.equal(usage().querySelector('.hccl-usage-account, .hccl-usage-credits, .hccl-usage-eligibility, dl, time, details, summary, a'), null);
      assert.doesNotMatch(usage().textContent, /r\*\*\*@example.test|审核工作区|chatgpt|ChatGPT|邮箱|账号类型|工作区|普通|credits|余额|12345678901234567890|资格|允许|暂受限|查询时间|已查询|2026-11-05T02:00:00Z|HIDDEN_RESET|RAW_SECRET|获得时间|历史|使用/);
      assert(!usage().textContent.includes(localDate(123456789)), 'grant dates are not rendered');
      assert.equal(usage().querySelectorAll('button').length, 1);
      assertRefreshButton(usage().querySelector('button[aria-label="刷新额度"]'), '刷新额度');
    });
  }
});

test('unknown ready usage shows unknown quota and count without fabricating windows or a zero balance', async () => {
  for (const missingUsage of [null, undefined, {}, { rateLimits: null }, { rateLimits: [] }, { rateLimits: 'not-an-array' }]) {
    const snapshot = ready(); snapshot.usage = missingUsage;
    await withPanel(async () => ok(snapshot), async ({ usage, clickUsage }) => {
      assert.equal(usage().dataset.state, 'ready');
      assert.equal(usage().querySelector('.hccl-usage-plan').textContent, 'Plus');
      assert.equal(usage().querySelector('.hccl-usage-empty').textContent, '额度：未提供');
      assert.equal(usage().querySelector('.hccl-usage-count strong').textContent, '未提供');
      assert.equal(usage().querySelector('.hccl-usage-bucket, .hccl-usage-window, [role="progressbar"], .hccl-usage-detail'), null);
      assert.doesNotMatch(usage().textContent, /已用 0%|可用 0|余额|资格|详情：|列表为空/);
    });
  }
});

test('plan badge normalizes known lowercase plans while unknown or missing plans never retain a previous value', async () => {
  const cases = [
    ['free', 'Free'], ['go', 'Go'], ['plus', 'Plus'], ['pro', 'Pro'], ['team', 'Team'], ['business', 'Business'], ['enterprise', 'Enterprise'], ['edu', 'Edu'],
    ['custom-plan', 'custom-plan'], ['__proto__', '__proto__'], [null, '未提供'], [undefined, '未提供'], ['', '未提供'], [' ', '未提供'], [7, '未提供'], [{}, '未提供'],
  ];
  let index = 0;
  await withPanel(async () => {
    const snapshot = ready(); snapshot.account.planType = cases[index++][0]; return ok(snapshot);
  }, async ({ calls, usage, clickUsage }) => {
    assert.equal(calls.accounts.length, 1, 'the first plan is loaded on entry');
    for (const [caseIndex, [, expected]] of cases.entries()) {
      if (caseIndex > 0) await clickUsage();
      assert.equal(usage().querySelectorAll('.hccl-usage-plan').length, 1);
      assert.equal(usage().querySelector('.hccl-usage-plan').getAttribute('aria-label'), '套餐类型');
      assert.equal(usage().querySelector('.hccl-usage-plan').textContent, expected);
    }
    assert.equal(calls.accounts.length, cases.length);
    assert.equal(calls.writes.length, 0);
  });
});

test('a single default quota omits a duplicate bucket title while a named quota keeps its own title', async () => {
  for (const [id, name, heading] of [['codex', 'Codex 默认', null], ['default', '默认额度', null], ['review', '代码审核', '代码审核']]) {
    const snapshot = ready();
    snapshot.usage.rateLimits = [{ ...snapshot.usage.rateLimits[0], id, name, secondary: null }];
    await withPanel(async () => ok(snapshot), async ({ usage, clickUsage }) => {
      assert.equal(usage().querySelector('h3').textContent, '套餐与额度');
      const buckets = usage().querySelectorAll('.hccl-usage-bucket');
      assert.equal(buckets.length, 1);
      assert.equal(buckets[0].getAttribute('aria-label'), name);
      assert.equal(buckets[0].querySelector('h4')?.textContent ?? null, heading);
      if (heading === null) assert(!buckets[0].textContent.includes(name), 'default bucket name remains accessible without a redundant visible heading');
      assert.deepEqual([...buckets[0].querySelectorAll('h5')].map(node => node.textContent), ['5 小时限额']);
      assert.equal(buckets[0].querySelectorAll('[role="progressbar"]').length, 1, 'missing secondary does not create a weekly quota');
    });
  }
});

test('secondary-only, primary-only and null windows render only the windows actually supplied', async () => {
  for (const [windows, labels] of [
    [{ primary: null, secondary: { usedPercent: 24, windowDurationMins: 10080, resetsAt: null } }, ['每周限额']],
    [{ secondary: { usedPercent: null, windowDurationMins: null, resetsAt: null } }, ['额度窗口 2']],
    [{ primary: { usedPercent: null, windowDurationMins: null, resetsAt: null }, secondary: null }, ['额度窗口 1']],
    [{ primary: null, secondary: null }, []],
    [{}, []],
  ]) {
    const snapshot = ready(); snapshot.usage.rateLimits = [{ id: 'codex', name: 'Codex 默认', ...windows }];
    await withPanel(async () => ok(snapshot), async ({ usage, clickUsage }) => {
      const bucket = usage().querySelector('.hccl-usage-bucket');
      assert.deepEqual([...bucket.querySelectorAll('h5')].map(node => node.textContent), labels);
      assert.equal(bucket.querySelectorAll('.hccl-usage-window').length, labels.length);
      assert.equal(bucket.querySelectorAll('[role="progressbar"]').length, labels.length);
      assert.equal(bucket.querySelector('.hccl-usage-empty')?.textContent ?? null, labels.length ? null : '额度：未提供');
      assert.doesNotMatch(bucket.textContent, /已用 0%|5 小时限额|主窗口|次窗口/);
    });
  }
});

test('unknown or invalid durations keep the primary/secondary fallback labels without inventing a duration', async () => {
  const durations = [null, undefined, 0, -1, 1.5, '300', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1];
  const snapshot = ready();
  snapshot.usage.rateLimits = durations.map((duration, index) => ({
    id: `unknown-${index}`, name: `未知时长 ${index + 1}`,
    primary: { usedPercent: null, windowDurationMins: duration, resetsAt: null },
    secondary: { usedPercent: null, windowDurationMins: duration, resetsAt: null },
  }));
  await withPanel(async () => ok(snapshot), async ({ usage, clickUsage }) => {
    for (const bucket of usage().querySelectorAll('.hccl-usage-bucket')) {
      assert.deepEqual([...bucket.querySelectorAll('h5')].map(node => node.textContent), ['额度窗口 1', '额度窗口 2']);
      assert.doesNotMatch(bucket.textContent, /小时限额|每周限额|分钟限额|天限额|已用 0%/);
    }
  });
});

test('negative, non-finite, missing and non-number usage percentages stay indeterminate rather than appearing as zero', async () => {
  const values = [null, undefined, NaN, Infinity, -Infinity, -2.75, '0', '12.5', {}];
  const snapshot = ready();
  snapshot.usage.rateLimits = values.map((usedPercent, index) => ({ id: `unknown-${index}`, primary: { usedPercent, windowDurationMins: 60, resetsAt: null }, secondary: null }));
  await withPanel(async () => ok(snapshot), async ({ usage, clickUsage }) => {
    const bars = usage().querySelectorAll('[role="progressbar"]');
    assert.equal(bars.length, values.length);
    for (const bar of bars) {
      assert.equal(bar.hasAttribute('aria-valuenow'), false);
      assert.equal(bar.getAttribute('aria-valuetext'), '已用比例：未提供');
      assert.equal(bar.dataset.unknown, 'true');
      assert.equal(bar.querySelector('.hccl-usage-fill'), null);
    }
    assert.deepEqual([...usage().querySelectorAll('.hccl-usage-percent')].map(node => node.textContent), values.map(() => '已用比例：未提供'));
    assert.doesNotMatch(usage().textContent, /已用 0%|NaN|Infinity|-2\.75%/);
  });
});

test('finite nonnegative percentages remain exact while only the visual progress is capped at 100', async () => {
  const values = [0, 0.125, 100, 125.25, 9876.54321];
  const snapshot = ready();
  snapshot.usage.rateLimits = values.map((usedPercent, index) => ({ id: `known-${index}`, primary: { usedPercent, windowDurationMins: 60, resetsAt: null } }));
  await withPanel(async () => ok(snapshot), async ({ usage, clickUsage }) => {
    const windows = [...usage().querySelectorAll('.hccl-usage-window')];
    assert.equal(windows.length, values.length);
    windows.forEach((window, index) => {
      const used = values[index], bar = window.querySelector('[role="progressbar"]');
      assert.equal(window.querySelector('.hccl-usage-percent').textContent, `已用 ${used}%`);
      assert.equal(bar.getAttribute('aria-valuetext'), `已用 ${used}%`);
      assert.equal(bar.getAttribute('aria-valuenow'), String(Math.min(100, used)));
      assert.equal(bar.dataset.unknown, 'false');
      assert.equal(bar.querySelector('.hccl-usage-fill').style.width, `${Math.min(100, used)}%`);
    });
  });
});

test('reset dates use local minute precision with offset and invalid Unix seconds stay unknown', async () => {
  const values = [0, 1793757629, null, undefined, -1, 1.5, '1793757600', NaN, Infinity, Number.MAX_SAFE_INTEGER];
  const snapshot = ready();
  snapshot.usage.rateLimits = values.map((resetsAt, index) => ({ id: `date-${index}`, primary: { usedPercent: 1, windowDurationMins: 60, resetsAt } }));
  await withPanel(async () => ok(snapshot), async ({ usage, clickUsage }) => {
    const dates = [...usage().querySelectorAll('.hccl-usage-reset')].map(node => node.textContent);
    assert.deepEqual(dates, [`重置：${localDate(0)}`, `重置：${localDate(1793757629)}`, ...values.slice(2).map(() => '重置：未提供')]);
    assert.doesNotMatch(dates.join(' '), /\d{2}:\d{2}:\d{2}|本地时区：|Invalid Date|NaN/);
  });
});

test('missing account identity fails closed even if a ready DTO contains plan and quota data', async () => {
  for (const account of [null, undefined, {}]) {
    const snapshot = ready(); snapshot.account = account;
    await withPanel(async () => ok(snapshot), async ({ usage, clickUsage }) => {
      assert.equal(usage().dataset.state, 'unverified');
      assert.equal(usage().querySelector('[role="status"]').textContent, '暂时无法确认账号，请稍后刷新。');
      assert.equal(usage().querySelector('.hccl-usage-plan, .hccl-usage-bucket, .hccl-usage-reset-cards, [role="progressbar"]'), null);
      assert.doesNotMatch(usage().textContent, /Plus|12\.5%|有效期未知|已用 0%/);
    });
  }
});

test('untrusted plan, bucket and available-card titles stay escaped text while hidden fields and raw messages never render', async () => {
  const snapshot = ready();
  const attack = '<img src=x onerror="globalThis.LEAK=true">';
  const planAttack = '<iframe src="javascript:alert(1)"></iframe>';
  const titleAttack = '<script>alert("secret")</script>';
  snapshot.account.planType = planAttack;
  snapshot.account.workspaceName = `HIDDEN_WORKSPACE_XSS${attack}`;
  snapshot.usage.rateLimits[0].name = attack;
  snapshot.usage.rateLimits[0].primary = { usedPercent: -2.75, windowDurationMins: 60, resetsAt: null };
  snapshot.usage.rateLimits[0].secondary = { usedPercent: NaN, windowDurationMins: null, resetsAt: null };
  snapshot.usage.rateLimits[1].name = null;
  snapshot.usage.rateLimits[1].id = '<svg onload="globalThis.LEAK=true"></svg>';
  snapshot.usage.resetCredits.details[0].title = titleAttack;
  snapshot.usage.resetCredits.details[0].description = `HIDDEN_DESCRIPTION_XSS${attack}`;
  snapshot.message = 'RAW_SECRET_IGNORED';
  await withPanel(async () => ok(snapshot), async ({ usage, clickUsage }) => {
    assert.equal(usage().querySelector('.hccl-usage-plan').textContent, planAttack);
    assert.equal(usage().querySelectorAll('.hccl-usage-bucket')[0].querySelector('h4').textContent, attack);
    assert.equal(usage().querySelectorAll('.hccl-usage-bucket')[0].getAttribute('aria-label'), attack);
    assert.equal(usage().querySelectorAll('.hccl-usage-bucket')[1].querySelector('h4').textContent, snapshot.usage.rateLimits[1].id);
    assert.equal(usage().querySelector('.hccl-usage-detail strong').textContent, titleAttack);
    assert.equal(usage().querySelector('img, script, iframe'), null);
    const refreshIcon = assertRefreshButton(usage().querySelector('button[aria-label="刷新额度"]'), '刷新额度');
    assert.deepEqual([...usage().querySelectorAll('svg')], [refreshIcon], 'only the trusted refresh icon renders as SVG, never a server title');
    assert.equal(usage().querySelector('[onload], [onerror]'), null);
    for (const escaped of ['&lt;img', '&lt;script', '&lt;iframe', '&lt;svg']) assert(usage().innerHTML.includes(escaped));
    assert.doesNotMatch(usage().innerHTML, /RAW_SECRET_IGNORED|HIDDEN_WORKSPACE_XSS|HIDDEN_DESCRIPTION_XSS/);
    const bars = usage().querySelectorAll('[role="progressbar"]');
    for (const bar of [bars[0], bars[1]]) {
      assert.equal(bar.hasAttribute('aria-valuenow'), false);
      assert.equal(bar.getAttribute('aria-valuetext'), '已用比例：未提供');
      assert.equal(bar.querySelector('.hccl-usage-fill'), null);
    }
    assert.deepEqual([...usage().querySelectorAll('.hccl-usage-bucket')[0].querySelectorAll('h5')].map(node => node.textContent), ['1 小时限额', '额度窗口 2']);
    assert.doesNotMatch(usage().textContent, /已用 -2\.75%/);
  });
});
