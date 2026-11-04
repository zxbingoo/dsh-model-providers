window.__ModuleLoader__.load({
  id: 'dsh-codex-cli',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PANEL = 'harness-codex-cli-link';
    // Each provider owns its configuration component. Future adapters (e.g. Claude)
    // add a descriptor and a component; unavailable adapters are not advertised.
    const PROVIDERS = [{ id: 'codex-cli', name: 'Codex', command: 'codex', mark: '⌘', component: 'codex' }];
    const css = `
.hccl{height:100%;min-height:0;overflow:auto;color:var(--dsw-alias-text-primary,inherit);background:var(--dsw-alias-bg-base,transparent);font:13px/1.55 system-ui,sans-serif}.hccl *{box-sizing:border-box}.hccl-wrap{max-width:920px;margin:0 auto;padding:48px 36px 64px}.hccl-header{margin-bottom:30px}.hccl h1{font-size:24px;font-weight:600;letter-spacing:-.6px;margin:0 0 6px}.hccl p{margin:0;color:var(--dsw-alias-text-secondary,inherit);opacity:.66}.hccl-list{border:1px solid var(--dsw-alias-border-l3,#8883);border-radius:12px;overflow:hidden}.hccl-provider-head{display:flex;align-items:center;gap:14px;padding:20px}.hccl-logo{display:grid;place-items:center;flex:none;width:40px;height:40px;border:1px solid #8883;border-radius:10px;font:24px/1 system-ui;background:#88888809}.hccl-provider-title{flex:1;min-width:0}.hccl-provider-title h2{font-size:15px;font-weight:600;margin:0 0 2px}.hccl-provider-sub{font-size:12px;display:flex;gap:10px;align-items:center;color:var(--dsw-alias-text-secondary,inherit)}.hccl-provider-sub code{opacity:.65;font-size:11px}.hccl-status{display:inline-flex;gap:6px;align-items:center;font-size:12px;color:var(--dsw-alias-text-secondary,inherit)}.hccl-dot{width:6px;height:6px;border-radius:50%;background:#999;display:inline-block}.hccl-dot[data-state=ready]{background:#45a279}.hccl-dot[data-state=checking]{background:#c39543}.hccl button{font:inherit;border:1px solid #8884;border-radius:7px;background:transparent;color:inherit;cursor:pointer;padding:7px 12px;white-space:nowrap}.hccl button:hover:not(:disabled){background:#88888810}.hccl button:disabled{opacity:.4;cursor:default}.hccl button:focus-visible,.hccl input:focus-visible,.hccl select:focus-visible,.hccl summary:focus-visible{outline:2px solid #6686ef;outline-offset:3px}.hccl-toggle{display:inline-flex;align-items:center;cursor:pointer;padding:5px}.hccl-toggle input{position:absolute;width:1px;height:1px;opacity:0}.hccl-track{width:34px;height:20px;background:#8886;border-radius:99px;position:relative;transition:background .15s}.hccl-track:after{content:'';position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0002;transition:transform .15s}.hccl-toggle input:checked+.hccl-track{background:#546cd4}.hccl-toggle input:checked+.hccl-track:after{transform:translateX(14px)}.hccl-toggle input:focus-visible+.hccl-track{outline:2px solid #6686ef;outline-offset:3px}.hccl-toggle input:disabled+.hccl-track{opacity:.4;cursor:default}.hccl-config-button{display:flex;align-items:center;gap:8px}.hccl-chevron{font-size:12px;transition:transform .15s}.hccl-chevron[data-open=true]{transform:rotate(180deg)}.hccl-body{border-top:1px solid #8883;padding:0 24px}.hccl-section-title{font-size:11px;letter-spacing:.6px;color:var(--dsw-alias-text-secondary,inherit);opacity:.6;padding-top:22px}.hccl-setting{display:grid;grid-template-columns:minmax(160px,1fr) minmax(200px,300px);gap:28px;padding:18px 0;border-bottom:1px solid #8882;align-items:start}.hccl-setting:last-child{border-bottom:0}.hccl-label{display:block;font-size:13px;font-weight:500;margin-bottom:4px}.hccl small{display:block;font-size:12px;line-height:1.5;opacity:.58}.hccl select,.hccl input[type=text]{width:100%;border:1px solid #8884;border-radius:7px;padding:8px 10px;background:var(--dsw-alias-bg-base,transparent);color:inherit;font:inherit;min-width:0}.hccl select option{background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-text-primary,#222)}.hccl-advanced{margin-top:8px}.hccl-advanced summary{cursor:pointer;font-size:11px;opacity:.6}.hccl-advanced input{margin-top:8px}.hccl-actions{display:flex;gap:8px;align-items:center;padding:18px 0;flex-wrap:wrap}.hccl-primary{background:#546cd4!important;color:white!important;border-color:transparent!important}.hccl-spacer{flex:1}.hccl-link{border:0!important;opacity:.65;font-size:12px!important;padding-left:0!important}.hccl-helper{font-size:12px;line-height:1.7;padding:16px 0;border-top:1px solid #8882;opacity:.58}.hccl-error{margin-top:16px;padding:12px 14px;border:1px solid #d666;border-radius:8px;color:#cf6b66;white-space:pre-wrap}.hccl-ok{padding-top:14px;color:#559d79;font-size:12px}.hccl-unsaved{font-size:11px;opacity:.5}.hccl-footer{margin-top:20px;font-size:11px;opacity:.45}@media(max-width:640px){.hccl-wrap{padding:28px 16px}.hccl-provider-head{padding:16px;gap:10px}.hccl-body{padding:0 16px}.hccl-setting{grid-template-columns:1fr;gap:10px}.hccl-logo{width:34px;height:34px}.hccl-actions .hccl-spacer{display:none}.hccl-config-button{padding:6px 8px!important}}@media(prefers-reduced-motion:reduce){.hccl *{transition:none!important}}
`;
    const unwrap = result => { if (!result.ok) throw new Error(result.error.message); return result.value; };
    function Icon() { return h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true }, h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 4 }), h('path', { d: 'm7 9 3 3-3 3m6 0h4' })); }
    return {
      name: PANEL,
      inject: ['slots', 'remote', 'remote.settings', 'remote.session'],
      apply(ctx) {
        function CodexConfiguration({ provider }) {
          const [expanded, setExpanded] = React.useState(false);
          const [row, setRow] = React.useState(null);
          const [defaults, setDefaults] = React.useState(null);
          const [form, setForm] = React.useState({ enabled: true, model: 'gpt-6.1-sol', reasoningEffort: 'default' });
          const [models, setModels] = React.useState([]);
          const [busy, setBusy] = React.useState(false);
          const [checking, setChecking] = React.useState(false);
          const [connected, setConnected] = React.useState(false);
          const [error, setError] = React.useState('');
          const [notice, setNotice] = React.useState('');
          const live = React.useRef(true);
          const dirty = React.useRef(false);
          const ns = React.useRef(PANEL);
          const generation = React.useRef(0);
          async function loadSettings() {
            const epoch = ++generation.current;
            const doc = unwrap(await ctx.remote.settings.describe());
            const entry = doc.namespaces.find(x => x.ns === ns.current);
            if (!entry) throw new Error('未找到提供商配置，请重启 Harness 后重试。');
            if (!live.current || epoch !== generation.current) return;
            setDefaults(doc.namespaces.find(x => x.ns === 'agent-default-model') ?? null);
            if (!dirty.current) { setRow(entry); setForm({ enabled: entry.value.enabled, model: entry.value.model, reasoningEffort: entry.value.reasoningEffort }); }
          }
          async function check() {
            setChecking(true); setError('');
            try {
              // Native remote.session transport also works in Electron's dsh-app scheme.
              // Generic connection.rpc HTTP channels are Web-only in this host version.
              const catalog = unwrap(await ctx.remote.session.modelCatalog());
              if (!live.current) return;
              const group = catalog.groups.find(g => g.id === provider.id);
              const list = (group?.models ?? []).filter(m => m.id !== 'configured');
              setModels(list); setConnected(list.length > 0);
              await loadSettings();
              if (!list.length) setNotice('模型目录为空：若 Codex 已停用，请先启用并保存，再刷新模型。');
            } catch (e) { if (live.current) { setConnected(false); setError(e.message); } }
            finally { if (live.current) setChecking(false); }
          }
          React.useEffect(() => {
            live.current = true;
            loadSettings().catch(e => { if (live.current) setError(e.message); });
            check();
            const stop = ctx.remote?.$on?.('settings/document-updated', () => { if (!dirty.current) loadSettings().catch(() => {}); });
            return () => { live.current = false; stop?.(); };
          }, []);
          function change(key, value) { dirty.current = true; setNotice(''); setForm(old => ({ ...old, [key]: value, ...(key === 'model' ? { reasoningEffort: 'default' } : {}) })); }
          async function save() {
            ++generation.current;
            setBusy(true); setError(''); setNotice('');
            try {
              const value = unwrap(await ctx.remote.settings.update(ns.current, form, row.revision));
              if (!live.current) return;
              dirty.current = false; setRow(value); setForm(value.value); setNotice('已保存，将用于下一次模型请求。');
            } catch (e) { if (live.current) setError(`${e.message}\n若配置已在其他页面修改，请重新载入后再保存。`); }
            finally { if (live.current) setBusy(false); }
          }
          async function makeDefault() {
            setBusy(true); setError(''); setNotice('');
            try {
              if (!form.enabled || dirty.current) throw new Error('请先启用 Codex 并保存配置。');
              if (!defaults) throw new Error('当前宿主未提供默认模型配置。');
              const value = unwrap(await ctx.remote.settings.mutate(defaults.ns, [{ op: 'set', path: ['provider'], value: 'codex-cli' }, { op: 'set', path: ['model'], value: 'configured' }, { op: 'unset', path: ['reasoningEffort'] }], defaults.revision));
              if (live.current) { setDefaults(value); setNotice('已设为 Harness 默认模型；现有会话的显式模型选择保持不变。'); }
            } catch (e) { if (live.current) setError(e.message); }
            finally { if (live.current) setBusy(false); }
          }
          const known = models.some(m => m.id === form.model);
          const status = checking ? '检查中' : !row ? '加载中' : !form.enabled ? '已停用' : connected ? '可用' : '待检查';
          const field = (id, title, description, control) => h('div', { className: 'hccl-setting' },
            h('div', null, h('label', { className: 'hccl-label', htmlFor: id }, title), h('small', null, description)), control);
          return h('article', { className: 'hccl-list', 'aria-label': `${provider.name} 配置` },
            h('div', { className: 'hccl-provider-head' },
              h('span', { className: 'hccl-logo', 'aria-hidden': true }, provider.mark),
              h('div', { className: 'hccl-provider-title' }, h('h2', null, provider.name),
                h('div', { className: 'hccl-provider-sub' }, h('code', null, provider.command),
                  h('span', { className: 'hccl-status', role: 'status' }, h('i', { className: 'hccl-dot', 'data-state': checking ? 'checking' : connected && form.enabled ? 'ready' : 'idle' }), status), connected && form.enabled && h('span', null, `${models.length} 个模型`))),
              h('label', { className: 'hccl-toggle', title: '启用 Codex CLI' },
                h('input', { type: 'checkbox', role: 'switch', 'aria-label': '启用 Codex CLI', checked: form.enabled, disabled: busy || !row, onChange: e => { change('enabled', e.target.checked); setExpanded(true); } }),
                h('span', { className: 'hccl-track', 'aria-hidden': true })),
              h('button', { className: 'hccl-config-button', 'aria-expanded': expanded, 'aria-controls': 'hccl-codex-settings', onClick: () => setExpanded(value => !value) }, '配置', h('span', { className: 'hccl-chevron', 'data-open': expanded, 'aria-hidden': true }, '⌄'))),
            h('div', { className: 'hccl-body', id: 'hccl-codex-settings', hidden: !expanded },
              h('div', { className: 'hccl-section-title' }, '模型与行为'),
              field('hccl-model', '默认模型', '使用“跟随插件配置”的会话会采用此模型。',
                h('div', null, h('select', { id: 'hccl-model', value: form.model, disabled: busy || !row, onChange: e => change('model', e.target.value) }, !known && h('option', { value: form.model }, form.model), ...models.map(m => h('option', { key: m.id, value: m.id }, m.name || m.id))),
                  h('details', { className: 'hccl-advanced' }, h('summary', null, '自定义模型 ID'), h('input', { id: 'hccl-custom-model', 'aria-label': '自定义模型 ID', type: 'text', value: form.model, maxLength: 200, disabled: busy || !row, onChange: e => change('model', e.target.value), placeholder: '输入上游模型 ID' })))),
              field('hccl-effort', '推理强度', '会话中的显式设置优先于此默认值。',
                h('select', { id: 'hccl-effort', value: form.reasoningEffort, disabled: busy || !row, onChange: e => change('reasoningEffort', e.target.value) }, ...[['default', '跟随 CLI 默认'], ...(models.find(m => m.id === form.model)?.reasoning?.efforts?.map(e => [e.id, e.name || e.id]) ?? [['none', '无'], ['minimal', '最低'], ['low', '低'], ['medium', '中'], ['high', '高'], ['xhigh', '最高'], ['max', 'Max'], ['ultra', 'Ultra']])].map(([id, label]) => h('option', { key: id, value: id }, label)))),
              h('div', { className: 'hccl-setting' }, h('div', null, h('span', { className: 'hccl-label' }, '模型目录'), h('small', null, '从本机 CLI 获取可用模型。')), h('button', { disabled: checking, onClick: () => check() }, checking ? '刷新中…' : '刷新模型')),
              h('div', { className: 'hccl-actions' },
                h('button', { className: 'hccl-primary', disabled: busy || !row || !form.model.trim() || !dirty.current, onClick: save }, busy ? '保存中…' : '保存配置'),
                h('button', { disabled: busy || !row, onClick: () => { dirty.current = false; loadSettings().then(() => setNotice('已重新载入。')).catch(e => setError(e.message)); } }, '重新载入'),
                dirty.current && h('span', { className: 'hccl-unsaved' }, '有未保存的更改'), h('span', { className: 'hccl-spacer' }),
                h('button', { className: 'hccl-link', disabled: busy || !row || !form.enabled || dirty.current || !defaults, onClick: makeDefault }, '设为 Harness 默认模型')),
              h('p', { className: 'hccl-helper' }, '使用本机 CLI 的登录与上游配置，凭据由 CLI 管理。配置保存在 Harness 中，不修改本机 CLI 配置。', h('br'), 'Codex CLI 0.166.0 · Python 3.11+')),
            error && h('div', { className: 'hccl-error', role: 'alert' }, error), notice && h('div', { className: 'hccl-ok', role: 'status' }, notice));
        }
        const configurationComponents = { codex: CodexConfiguration };
        function Panel() {
          return h('section', { className: 'hccl', 'aria-label': 'Providers 配置' }, h('style', null, css),
            h('div', { className: 'hccl-wrap' },
              h('header', { className: 'hccl-header' }, h('h1', null, 'Providers'), h('p', null, '管理模型提供商及其默认配置。')),
              ...PROVIDERS.map(provider => h(configurationComponents[provider.component], { key: provider.id, provider })),
              h('p', { className: 'hccl-footer' }, '模型更改将在下一次请求生效。当前任务执行期间请勿切换模型。')));
        }
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, Panel));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 15, label: 'Providers' }, Icon));
      },
    };
  },
});
