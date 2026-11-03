window.__ModuleLoader__.load({
  id: 'harness-codex-cli-link',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PANEL = 'harness-codex-cli-link';
    const css = `
.hccl{height:100%;overflow:auto;background:var(--background-primary,transparent);color:inherit;font:14px/1.6 system-ui,sans-serif}.hccl *{box-sizing:border-box}.hccl-wrap{max-width:860px;margin:auto;padding:44px 28px 64px}.hccl-header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:30px}.hccl h1{font-size:28px;letter-spacing:-.8px;margin:4px 0}.hccl p{margin:0;opacity:.68}.hccl-eyebrow{font-size:11px;letter-spacing:2px;opacity:.55}.hccl-card{border:1px solid #8883;border-radius:16px;padding:24px;margin:16px 0;background:#88888805}.hccl-card h2{font-size:16px;margin:0 0 18px}.hccl-row{display:flex;justify-content:space-between;align-items:center;gap:20px}.hccl-label{display:block;font-weight:600;margin-bottom:8px}.hccl-field{margin:20px 0}.hccl select,.hccl input[type=text]{width:100%;padding:11px 12px;border:1px solid #8885;border-radius:9px;background:transparent;color:inherit;font:inherit}.hccl select option{color:#222;background:#fff}.hccl small{display:block;opacity:.6;margin-top:7px}.hccl button{border:1px solid #8885;border-radius:9px;background:transparent;color:inherit;font:inherit;padding:9px 14px;cursor:pointer}.hccl button:disabled{opacity:.4;cursor:default}.hccl button:focus-visible,.hccl input:focus-visible,.hccl select:focus-visible{outline:2px solid #6686ef;outline-offset:3px}.hccl-primary{background:#506bd8!important;color:white!important;border-color:transparent!important}.hccl-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.hccl-badge{border:1px solid #8884;border-radius:999px;padding:4px 10px;font-size:12px;white-space:nowrap}.hccl-status{color:#669978}.hccl-note{margin-top:14px!important;font-size:12px}.hccl-error{padding:12px 16px;border:1px solid #d66a;border-radius:10px;color:#cd6666;white-space:pre-wrap}.hccl-ok{padding:10px 0;color:#669978}.hccl-switch{position:relative;width:42px;height:24px;accent-color:#506bd8;cursor:pointer}.hccl-split{display:grid;grid-template-columns:1fr 1fr;gap:20px}.hccl kbd{font-size:12px;border:1px solid #8884;border-radius:4px;padding:1px 5px}@media(max-width:600px){.hccl-wrap{padding:24px 16px}.hccl-split{grid-template-columns:1fr;gap:0}.hccl-header{align-items:flex-start}.hccl-card{padding:18px}}
`;
    const unwrap = result => { if (!result.ok) throw new Error(result.error.message); return result.value; };
    function Icon() { return h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true }, h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 4 }), h('path', { d: 'm7 9 3 3-3 3m6 0h4' })); }
    return {
      name: PANEL,
      inject: ['slots', 'remote', 'remote.settings', 'remote.session'],
      apply(ctx) {
        function Panel() {
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
            if (!entry) throw new Error('未找到插件配置，请重启 Harness 以加载 0.2.0 版本。');
            if (!live.current || epoch !== generation.current) return;
            setDefaults(doc.namespaces.find(x => x.ns === 'agent-default-model') ?? null);
            if (!dirty.current) { setRow(entry); setForm({ enabled: entry.value.enabled, model: entry.value.model, reasoningEffort: entry.value.reasoningEffort }); }
          }
          async function check(refresh = false) {
            setChecking(true); setError('');
            try {
              // Native remote.session transport also works in Electron's dsh-app scheme.
              // Generic connection.rpc HTTP channels are Web-only in this host version.
              const catalog = unwrap(await ctx.remote.session.modelCatalog());
              if (!live.current) return;
              const group = catalog.groups.find(g => g.id === 'codex-cli');
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
          return h('section', { className: 'hccl', 'aria-label': 'Providers 配置' }, h('style', null, css),
            h('div', { className: 'hccl-wrap' },
              h('header', { className: 'hccl-header' }, h('div', null, h('div', { className: 'hccl-eyebrow' }, 'HARNESS · CLI LINK'), h('h1', null, 'Providers'), h('p', null, '连接本机 CLI，让模型与 Harness 工具协同工作。')), h('span', { className: 'hccl-badge' }, '仅支持 Codex')),
              h('div', { className: 'hccl-card' }, h('div', { className: 'hccl-row' }, h('div', null, h('strong', null, '启用 Codex CLI'), h('p', null, '停用后拒绝新的 Codex 请求，不影响其他提供商。')), h('input', { className: 'hccl-switch', type: 'checkbox', role: 'switch', 'aria-label': '启用 Codex CLI', checked: form.enabled, disabled: busy || !row, onChange: e => change('enabled', e.target.checked) }))),
              h('div', { className: 'hccl-card' }, h('h2', null, '模型配置'),
                h('div', { className: 'hccl-field' }, h('label', { className: 'hccl-label', htmlFor: 'hccl-model' }, '默认模型'),
                  h('select', { id: 'hccl-model', value: form.model, disabled: busy || !row, onChange: e => change('model', e.target.value) }, !known && h('option', { value: form.model }, form.model), ...models.map(m => h('option', { key: m.id, value: m.id }, m.name || m.id))),
                  h('small', null, '在会话中选择“跟随插件配置”，即可使用此模型。显式选择其他模型的会话不会被覆盖。')),
                h('div', { className: 'hccl-field' }, h('label', { className: 'hccl-label', htmlFor: 'hccl-custom-model' }, '自定义模型 ID'), h('input', { id: 'hccl-custom-model', type: 'text', value: form.model, maxLength: 200, disabled: busy || !row, onChange: e => change('model', e.target.value), placeholder: '例如 gpt-6.1-sol' }), h('small', null, '自定义上游的模型可能不在 CLI 目录中；请确认上游支持该 ID。')),
                h('div', { className: 'hccl-field' }, h('label', { className: 'hccl-label', htmlFor: 'hccl-effort' }, '默认推理强度'), h('select', { id: 'hccl-effort', value: form.reasoningEffort, disabled: busy || !row, onChange: e => change('reasoningEffort', e.target.value) }, ...[['default', '跟随 CLI 默认'], ...(models.find(m => m.id === form.model)?.reasoning?.efforts?.map(e => [e.id, e.name || e.id]) ?? [['none', '无'], ['minimal', '最低'], ['low', '低'], ['medium', '中'], ['high', '高'], ['xhigh', '最高'], ['max', 'Max'], ['ultra', 'Ultra']])].map(([id, label]) => h('option', { key: id, value: id }, label))), h('small', null, '不同模型支持的强度不同；会话显式设置优先。')),
                h('div', { className: 'hccl-actions' }, h('button', { className: 'hccl-primary', disabled: busy || !row || !form.model.trim(), onClick: save }, busy ? '保存中…' : '保存配置'), h('button', { disabled: busy || !row, onClick: () => { dirty.current = false; loadSettings().then(() => setNotice('已重新载入。')).catch(e => setError(e.message)); } }, '重新载入'), h('button', { disabled: busy || !row || !form.enabled || dirty.current || !defaults, onClick: makeDefault }, '设为 Harness 默认模型'))),
              h('div', { className: 'hccl-card' }, h('div', { className: 'hccl-row' }, h('div', null, h('h2', { style: { marginBottom: 4 } }, '本机连接'), h('span', { className: connected ? 'hccl-status' : '' }, checking ? '正在检查 CLI…' : connected ? '● Codex CLI 可用 · 0.166.0' : '○ 尚未连接')), h('button', { disabled: checking, onClick: () => check(true) }, checking ? '检查中…' : '检查连接 / 刷新模型')), h('p', { className: 'hccl-note' }, '复用本机 Codex 登录及上游配置。本插件不读取或复制登录 token，也不修改 Codex 的配置文件。')),
              error && h('div', { className: 'hccl-error', role: 'alert' }, error), notice && h('div', { className: 'hccl-ok', role: 'status' }, notice),
              h('p', { className: 'hccl-note' }, '需要 Codex CLI 0.166.0 和 Python 3.11+。当前仅支持文本输入；配置保存在 Harness profile 中。更改模型时请等待当前工具任务结束。')
            ));
        }
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, Panel));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 15, label: 'Providers' }, Icon));
      },
    };
  },
});
