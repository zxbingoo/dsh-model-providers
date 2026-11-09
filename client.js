window.__ModuleLoader__.load({
  id: 'dsh-model-providers',
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
    const usageCss = `

.hccl-version{display:inline-block;margin-top:10px;padding:3px 9px;border:1px solid var(--dsw-alias-border-l3,#8884);border-radius:99px;font-size:11px;color:var(--dsw-alias-text-secondary,inherit)}
.hccl-provider-details{border-top:1px solid var(--dsw-alias-border-l3,#8883)}.hccl-provider-details[hidden],.hccl-tabpanel[hidden]{display:none}
.hccl-tabs{display:flex;gap:22px;padding:0 24px;border-bottom:1px solid var(--dsw-alias-border-l3,#8883)}.hccl .hccl-tab{position:relative;border:0;border-radius:0;padding:14px 0 12px;background:transparent;color:var(--dsw-alias-text-secondary,inherit)}.hccl .hccl-tab:hover{background:transparent;color:var(--dsw-alias-text-primary,inherit)}.hccl .hccl-tab[aria-selected=true]{font-weight:600;color:var(--dsw-alias-text-primary,inherit)}.hccl-tab[aria-selected=true]:after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px;border-radius:2px;background:var(--dsw-alias-accent-primary,#546cd4)}.hccl .hccl-tab:focus-visible,.hccl-tabpanel:focus-visible{outline:2px solid #6686ef;outline-offset:-3px}
.hccl-provider-details .hccl-body{border-top:0;padding-bottom:22px}
.hccl-model-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:22px}.hccl-model-head h3{margin:0;font-size:14px;font-weight:600}
.hccl .hccl-refresh-button{display:inline-flex;align-items:center;justify-content:center;flex:none;width:30px;height:30px;padding:6px;border:0;border-radius:6px;color:var(--dsw-alias-text-secondary,inherit)}.hccl-refresh-button svg{display:block;pointer-events:none}.hccl-refresh-button[aria-busy=true] svg{animation:hccl-refresh-spin 1s linear infinite}@keyframes hccl-refresh-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.hccl-refresh-button[aria-busy=true] svg{animation:none}}
.hccl-usage{margin:0;padding:22px 24px 24px;overflow-wrap:anywhere}
.hccl-usage h3{margin:0;font-size:14px;font-weight:600}.hccl-usage h4{margin:0;font-size:12px;font-weight:600}.hccl-usage p{opacity:1}
.hccl-usage-head,.hccl-usage-title,.hccl-usage-window-head,.hccl-usage-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.hccl-usage-title{justify-content:flex-start;flex-wrap:wrap;gap:8px}.hccl-usage-head>div{min-width:0}
.hccl-usage-plan,.hccl-usage-count{font-size:11px;padding:2px 8px;border-radius:6px;background:#88888814;font-variant-numeric:tabular-nums}.hccl-usage-plan{font-weight:500}.hccl-usage-count strong{font-weight:600}
.hccl-usage-status{margin-top:14px!important;font-size:12px;color:var(--dsw-alias-text-secondary,inherit)}.hccl-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.hccl-usage-buckets{display:grid;gap:18px;margin-top:20px}.hccl-usage-bucket{min-width:0}.hccl-usage-bucket>h4{margin-bottom:9px;color:var(--dsw-alias-text-secondary,inherit)}
.hccl-usage-windows{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.hccl-usage-window{min-width:0}.hccl-usage-window h5{margin:0;font-size:12px;font-weight:500}.hccl-usage-percent{font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}.hccl-usage-window-head{align-items:baseline;flex-wrap:wrap;gap:4px 10px}
.hccl-usage-progress{height:5px;border-radius:99px;overflow:hidden;background:#88888825;margin:8px 0}.hccl-usage-fill{height:100%;border-radius:inherit;background:var(--dsw-alias-accent-primary,#6686ef)}.hccl-usage-progress[data-unknown=true]{background:repeating-linear-gradient(110deg,#88888818 0px,#88888818 5px,#88888830 5px,#88888830 10px)}
.hccl-usage-reset,.hccl-usage-expiry{font-size:11px;color:var(--dsw-alias-text-secondary,inherit);font-variant-numeric:tabular-nums}.hccl-usage-empty{font-size:12px;margin-top:16px!important}
.hccl-usage-reset-cards{margin-top:20px;padding-top:16px;border-top:1px solid var(--dsw-alias-border-l3,#8883)}.hccl-usage-details{list-style:none;margin:10px 0 0;padding:0 14px;border:1px solid var(--dsw-alias-border-l3,#8883);border-radius:10px;background:#88888808}.hccl-usage-detail{padding:12px 0}.hccl-usage-detail+.hccl-usage-detail{border-top:1px solid var(--dsw-alias-border-l3,#8883)}.hccl-usage-detail strong{display:block;font-size:12px;font-weight:500}.hccl-usage-expiry{margin-top:3px!important}
@media(max-width:640px){.hccl-provider-sub{flex-wrap:wrap;gap:3px 8px}.hccl-provider-sub>span{white-space:nowrap}.hccl-tabs{padding:0 16px;gap:20px}.hccl-usage{padding:18px 16px 20px}.hccl-usage-windows{grid-template-columns:minmax(0,1fr);gap:16px}.hccl-usage-head{align-items:flex-start}.hccl-usage-title{align-items:flex-start;gap:6px}.hccl-usage-card-head{align-items:flex-start;flex-wrap:wrap}}
`;
    const unwrap = result => { if (!result.ok) throw new Error(result.error.message); return result.value; };
    const usageMessages = {
      ready: '额度已更新。',
      signedOut: '尚未登录 ChatGPT 账号。',
      unsupported: '当前账号不支持额度查询。',
      unavailable: '额度暂不可用，请稍后刷新。',
      changed: '账号状态已变化，请重新刷新。',
      unverified: '暂时无法确认账号，请稍后刷新。',
    };
    const usageFailureMessages = {
      endpointUnavailable: '额度接口未就绪，请确认插件已正确加载。',
      forbidden: '当前连接无权查看账号额度。',
      invalidResponse: '额度接口响应不兼容，请更新插件。',
      connectionError: '额度接口连接失败，请稍后刷新。',
    };
    const isUsageRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    function readUsageResult(result) {
      const invalid = { snapshot: null, state: 'invalidResponse' };
      if (!isUsageRecord(result) || !Object.hasOwn(result, 'ok')) return invalid;
      if (result.ok === false) {
        const error = result.error;
        if (!Object.hasOwn(result, 'error') || !isUsageRecord(error) ||
            !Object.hasOwn(error, 'code') || typeof error.code !== 'string' ||
            !Object.hasOwn(error, 'message') || typeof error.message !== 'string') return invalid;
        const state = error.code === 'codex/not-found' ? 'endpointUnavailable' : error.code === 'codex/forbidden' ? 'forbidden' : 'unavailable';
        return { snapshot: null, state };
      }
      if (result.ok !== true || !Object.hasOwn(result, 'value')) return invalid;
      const dto = result.value;
      // UI-only failure states must never become accepted server DTO states.
      if (!isUsageRecord(dto) || !Object.hasOwn(dto, 'version') || dto.version !== 1 ||
          !Object.hasOwn(dto, 'state') || typeof dto.state !== 'string' || !Object.hasOwn(usageMessages, dto.state)) return invalid;
      let state = dto.state;
      if (state === 'ready' && dto.account?.type !== 'chatgpt') {
        state = ['apiKey', 'amazonBedrock', 'gcp'].includes(dto.account?.type) ? 'unsupported' : 'unverified';
      }
      return { snapshot: state === 'ready' ? { ...dto, state } : null, state };
    }
    function usageTransportState(error) {
      // Match only this carrier's complete error for this channel, never arbitrary status/code fields.
      let message;
      try { message = error?.message; } catch { return 'connectionError'; }
      const prefix = `transport failure for /${PANEL}/accountUsage: HTTP `;
      if (message === `${prefix}404` || message === `${prefix}405`) return 'endpointUnavailable';
      if (message === `${prefix}401` || message === `${prefix}403`) return 'forbidden';
      return 'connectionError';
    }
    const positiveCapacity = value => Number.isSafeInteger(value) && value > 0;
    function readContextMetadata(result) {
      // The host catalog can strip extension metadata; only the directory RPC
      // supplies automatic capacities. Never reuse settings-applied overrides.
      if (!isUsageRecord(result) || !Object.hasOwn(result, 'ok') || result.ok !== true ||
          !Object.hasOwn(result, 'value') || !isUsageRecord(result.value) ||
          result.value.namespace !== PANEL || !Object.hasOwn(result.value, 'models') || !Array.isArray(result.value.models)) return null;
      return result.value.models.filter(model => isUsageRecord(model) &&
        Object.hasOwn(model, 'id') && typeof model.id === 'string' &&
        model.contextSource === 'codex-native-catalog' && isUsageRecord(model.context) &&
        positiveCapacity(model.context.contextWindow)).map(model => ({ id: model.id, capacity: model.context.contextWindow }));
    }
    const textOrUnknown = value => typeof value === 'string' && value.trim() ? value : '未提供';
    const countOrUnknown = value => typeof value === 'string' && /^\d+$/.test(value) ? value : '未提供';
    function planLabel(value) {
      const labels = { free: 'Free', go: 'Go', plus: 'Plus', pro: 'Pro', team: 'Team', business: 'Business', enterprise: 'Enterprise', edu: 'Edu' };
      return Object.hasOwn(labels, value) ? labels[value] : textOrUnknown(value);
    }
    function localDate(value) {
      if (!Number.isSafeInteger(value) || value < 0) return '未提供';
      const date = new Date(value * 1000);
      if (!Number.isFinite(date.getTime())) return '未提供';
      return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset' }).format(date);
    }
    function windowLabel(mins, fallback) {
      if (!Number.isSafeInteger(mins) || mins <= 0) return fallback;
      if (mins === 10080) return '每周限额';
      if (mins % 1440 === 0) return `${mins / 1440} 天限额`;
      if (mins % 60 === 0) return `${mins / 60} 小时限额`;
      return `${mins} 分钟限额`;
    }
    function UsageWindow({ window, fallback, bucket }) {
      const used = window?.usedPercent;
      const known = typeof used === 'number' && Number.isFinite(used) && used >= 0;
      const description = known ? `已用 ${used}%` : '已用比例：未提供';
      const label = windowLabel(window?.windowDurationMins, fallback);
      const clamped = known ? Math.min(100, used) : undefined;
      return h('div', { className: 'hccl-usage-window' },
        h('div', { className: 'hccl-usage-window-head' }, h('h5', null, label), h('span', { className: 'hccl-usage-percent' }, description)),
        h('div', { className: 'hccl-usage-progress', role: 'progressbar', 'aria-label': `${bucket} · ${label}`, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': clamped, 'aria-valuetext': description, 'data-unknown': !known },
          known && h('div', { className: 'hccl-usage-fill', style: { width: `${clamped}%` } })),
        h('div', { className: 'hccl-usage-reset' }, '重置：', localDate(window?.resetsAt)));
    }
    function UsageBucket({ bucket, index, multiple }) {
      const name = textOrUnknown(bucket?.name || bucket?.id || `额度 ${index + 1}`);
      const windows = [['primary', '额度窗口 1'], ['secondary', '额度窗口 2']].filter(([key]) => bucket?.[key] != null);
      return h('section', { className: 'hccl-usage-bucket', 'aria-label': name },
        (multiple || !['codex', 'default'].includes(bucket?.id)) && h('h4', null, name),
        windows.length ? h('div', { className: 'hccl-usage-windows' }, ...windows.map(([key, fallback]) => h(UsageWindow, { key, window: bucket[key], fallback, bucket: name }))) :
          h('p', { className: 'hccl-usage-empty' }, '额度：未提供'));
    }
    function resetCreditTitle(detail) {
      if (typeof detail.title === 'string' && detail.title.trim()) {
        return detail.title.trim().toLowerCase() === 'full reset' ? '完全重置' : detail.title;
      }
      return detail.type === 'codexRateLimits' ? '额度重置' : '重置卡';
    }
    function ResetCredits({ credits }) {
      // Show only available cards, never history or a redemption action. The count
      // comes from the backend, not this potentially incomplete detail list.
      const count = countOrUnknown(credits?.availableCount);
      const details = count === '0' || !Array.isArray(credits?.details) ? [] : credits.details.filter(detail => detail?.status === 'available');
      return h('section', { className: 'hccl-usage-reset-cards', 'aria-label': '重置额度卡' },
        h('div', { className: 'hccl-usage-card-head' }, h('h4', null, '重置额度卡'),
          h('span', { className: 'hccl-usage-count', title: '数量由服务端提供；返回的卡片列表可能不完整。' }, '可用 ', h('strong', null, count))),
        details.length > 0 && h('ul', { className: 'hccl-usage-details', 'aria-label': '返回的可用重置卡' }, ...details.map((detail, index) => h('li', { key: index, className: 'hccl-usage-detail' },
          h('strong', null, resetCreditTitle(detail)),
          h('p', { className: 'hccl-usage-expiry' }, detail.expiryKnown !== true ? '到期时间未提供' : detail.expiresAt === null ? '不过期' : `将于 ${localDate(detail.expiresAt)} 到期`)))));
    }
    function UsageSnapshot({ snapshot }) {
      if (snapshot.state !== 'ready') return null;
      const usage = snapshot.usage;
      const buckets = Array.isArray(usage?.rateLimits) ? usage.rateLimits : [];
      return h(React.Fragment, null,
        buckets.length ? h('div', { className: 'hccl-usage-buckets' }, ...buckets.map((bucket, index) => h(UsageBucket, { key: index, bucket, index, multiple: buckets.length > 1 }))) :
          h('p', { className: 'hccl-usage-empty' }, '额度：未提供'),
        h(ResetCredits, { credits: usage?.resetCredits }));
    }
    function RefreshButton({ label, busy, onClick }) {
      // Native hover hint; hovering never starts a query or writes configuration.
      return h('button', { type: 'button', className: 'hccl-refresh-button', 'aria-label': label,
        title: busy ? `${label}中…` : label, 'aria-busy': busy, disabled: busy, onClick },
        h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false' },
          h('path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5' }),
          h('path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5' })));
    }
    // One request enters a routing core and branches into three model endpoints.
    // A separate monochrome mark, not the avatar shrunk to 18px: currentColor
    // inherits the sidebar's hover/selected/disabled and light/dark theme states.
    function Icon() {
      return h('svg', { width: 18, height: 18, viewBox: '-2 -2 28 28', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false', 'data-brand-icon': 'model-router' },
        h('path', { d: 'M2 12h3.9M12.7 12H18M16 12V7a2 2 0 0 1 2-2M16 12v5a2 2 0 0 0 2 2' }),
        h('path', { d: 'm9.3 8.6 3.4 3.4-3.4 3.4L5.9 12Z' }),
        ...[3, 10, 17].map(y => h('rect', { key: y, x: 18, y, width: 4, height: 4, rx: 1.1 })));
    }
    return {
      name: PANEL,
      inject: ['slots', 'remote', 'remote.settings', 'remote.session', 'connection'],
      apply(ctx) {
        function AccountUsage() {
          const [snapshot, setSnapshot] = React.useState(null);
          const [state, setState] = React.useState('idle');
          const [busy, setBusy] = React.useState(false);
          const live = React.useRef(false);
          const generation = React.useRef(0);
          const request = React.useRef(null);
          React.useEffect(() => {
            live.current = true;
            const epoch = generation.current;
            // Load once on entry when empty, not on every render or failed result.
            // Deferring skips StrictMode's discarded setup and same-turn unmounts.
            Promise.resolve().then(() => {
              if (live.current && epoch === generation.current && !snapshot) refresh();
            });
            return () => {
              live.current = false;
              ++generation.current;
              request.current?.abort();
              request.current = null;
            };
          }, []);
          async function refresh() {
            if (!live.current || request.current) return;
            const epoch = ++generation.current;
            const controller = new AbortController();
            request.current = controller;
            // Never retain another account's data while a fresh identity check is pending.
            setSnapshot(null); setState('loading'); setBusy(true);
            // Keep the failure phase local; remote errors cannot choose a UI state.
            let failureState = 'connectionError';
            try {
              // rc.5 routes this connection RPC in both Web and Electron; no direct HTTP or credentials.
              const result = await ctx.connection.rpc.call(`/${PANEL}`, 'accountUsage', {}, controller.signal);
              if (!live.current || epoch !== generation.current || controller.signal.aborted) return;
              failureState = 'invalidResponse';
              const next = readUsageResult(result);
              setSnapshot(next.snapshot); setState(next.state);
            } catch (error) {
              if (live.current && epoch === generation.current && !controller.signal.aborted) {
                setSnapshot(null); setState(failureState === 'connectionError' ? usageTransportState(error) : failureState);
              }
            } finally {
              if (live.current && epoch === generation.current) {
                request.current = null; setBusy(false);
              }
            }
          }
          const message = state === 'idle' ? '正在准备查询…' : state === 'loading' ? '正在查询…' : usageMessages[state] ?? usageFailureMessages[state];
          return h('section', { className: 'hccl-usage', role: 'region', 'aria-label': '账号与额度', 'aria-busy': busy, 'data-state': state },
            h('div', { className: 'hccl-usage-head' },
              h('div', { className: 'hccl-usage-title' }, h('h3', null, '套餐与额度'),
                state === 'ready' && h('span', { className: 'hccl-usage-plan', 'aria-label': '套餐类型' }, planLabel(snapshot?.account?.planType))),
              h(RefreshButton, { label: '刷新额度', busy, onClick: refresh })),
            h('p', { className: state === 'ready' ? 'hccl-sr-only' : 'hccl-usage-status', role: 'status', 'aria-live': 'polite', 'aria-atomic': true }, message),
            snapshot && h(UsageSnapshot, { snapshot }));
        }
        function CodexConfiguration({ provider }) {
          const [expanded, setExpanded] = React.useState(false);
          const [activeTab, setActiveTab] = React.useState('settings');
          const tabRefs = React.useRef({});
          const [row, setRow] = React.useState(null);
          const [defaults, setDefaults] = React.useState(null);
          const [form, setForm] = React.useState({ enabled: true, model: 'gpt-6.1-sol', reasoningEffort: 'default' });
          const [models, setModels] = React.useState([]);
          const [contextMetadata, setContextMetadata] = React.useState([]);
          const [contextState, setContextState] = React.useState('idle');
          const [busy, setBusy] = React.useState(false);
          const [checking, setChecking] = React.useState(false);
          const [connected, setConnected] = React.useState(false);
          const [error, setError] = React.useState('');
          const [notice, setNotice] = React.useState('');
          const live = React.useRef(true);
          const dirty = React.useRef(false);
          const ns = React.useRef(PANEL);
          const generation = React.useRef(0);
          const catalogGeneration = React.useRef(0);
          async function loadSettings() {
            const epoch = ++generation.current;
            const doc = unwrap(await ctx.remote.settings.describe());
            const entry = doc.namespaces.find(x => x.ns === ns.current);
            if (!entry) throw new Error('未找到提供商配置，请重启 Harness 后重试。');
            if (!live.current || epoch !== generation.current) return;
            setDefaults(doc.namespaces.find(x => x.ns === 'agent-default-model') ?? null);
            if (!dirty.current) {
              setRow(entry);
              setForm({ enabled: entry.value.enabled, model: entry.value.model, reasoningEffort: entry.value.reasoningEffort,
                // Preserve legacy configuration verbatim on unrelated saves, but never edit or display it.
                ...(Object.hasOwn(entry.value, 'contextWindows') ? { contextWindows: entry.value.contextWindows } : {}) });
            }
          }
          async function check() {
            const epoch = ++catalogGeneration.current;
            const current = () => live.current && epoch === catalogGeneration.current;
            setChecking(true); setError('');
            setContextMetadata([]); setContextState('loading');
            try {
              // Keep the existing native model-catalog path independent of account usage RPC.
              const catalog = unwrap(await ctx.remote.session.modelCatalog());
              if (!current()) return;
              const group = catalog.groups.find(g => g.id === provider.id);
              const list = (group?.models ?? []).filter(m => m.id !== 'configured');
              setModels(list); setConnected(list.length > 0);
              // modelCatalog already refreshed the native directory. Read its full
              // metadata once, without another CLI discovery or account query.
              try {
                const result = await ctx.connection.rpc.call(`/${PANEL}`, 'status', { refresh: false });
                if (!current()) return;
                const metadata = readContextMetadata(result);
                setContextMetadata(metadata ?? []); setContextState(metadata === null ? 'failed' : 'ready');
              } catch {
                if (!current()) return;
                setContextMetadata([]); setContextState('failed');
              }
              await loadSettings();
              if (!list.length) setNotice('模型目录为空：若 Codex 已停用，请先启用并保存，再刷新模型。');
            } catch (e) { if (current()) { setConnected(false); setContextMetadata([]); setContextState('failed'); setError(e.message); } }
            finally { if (current()) setChecking(false); }
          }
          React.useEffect(() => {
            live.current = true;
            loadSettings().catch(e => { if (live.current) setError(e.message); });
            check();
            const stop = ctx.remote?.$on?.('settings/document-updated', () => { if (!dirty.current) loadSettings().catch(() => {}); });
            return () => { live.current = false; ++catalogGeneration.current; stop?.(); };
          }, []);
          function change(key, value) { dirty.current = true; setNotice(''); setForm(old => ({ ...old, [key]: value, ...(key === 'model' ? { reasoningEffort: 'default' } : {}) })); }
          async function save() {
            ++generation.current;
            setBusy(true); setError(''); setNotice('');
            try {
              const value = unwrap(await ctx.remote.settings.update(ns.current, form, row.revision));
              if (!live.current) return;
              dirty.current = false; setRow(value); setForm(value.value); setNotice('已保存默认配置；会话中手动选择的模型保持不变。');
            } catch (e) { if (live.current) setError(`${e.message}\n若配置已在其他页面修改，请重新进入此页面获取最新配置后再修改并保存（未保存的更改会丢失）。`); }
            finally { if (live.current) setBusy(false); }
          }
          async function makeDefault() {
            setBusy(true); setError(''); setNotice('');
            try {
              if (!form.enabled || dirty.current) throw new Error('请先启用 Codex 并保存配置。');
              if (!defaults) throw new Error('当前宿主未提供默认模型配置。');
              const value = unwrap(await ctx.remote.settings.mutate(defaults.ns, [{ op: 'set', path: ['provider'], value: 'codex-cli' }, { op: 'set', path: ['model'], value: form.model }, { op: 'unset', path: ['reasoningEffort'] }], defaults.revision));
              if (live.current) { setDefaults(value); setNotice('已设为 Harness 默认模型；现有会话的显式模型选择保持不变。'); }
            } catch (e) { if (live.current) setError(e.message); }
            finally { if (live.current) setBusy(false); }
          }
          function tabKeyDown(event, key) {
            const keys = ['settings', 'usage'];
            const index = keys.indexOf(key);
            let next;
            if (event.key === 'ArrowRight') next = keys[(index + 1) % keys.length];
            else if (event.key === 'ArrowLeft') next = keys[(index + keys.length - 1) % keys.length];
            else if (event.key === 'Home') next = keys[0];
            else if (event.key === 'End') next = keys[keys.length - 1];
            else return;
            event.preventDefault();
            setActiveTab(next);
            tabRefs.current[next]?.focus();
          }
          const tab = (key, label) => h('button', {
            type: 'button', className: 'hccl-tab', role: 'tab', id: `hccl-codex-tab-${key}`,
            'aria-controls': `hccl-codex-${key}`, 'aria-selected': activeTab === key,
            tabIndex: activeTab === key ? 0 : -1,
            ref: node => { tabRefs.current[key] = node; },
            onClick: () => setActiveTab(key), onKeyDown: event => tabKeyDown(event, key),
          }, label);
          const known = models.some(m => m.id === form.model);
          const capacity = contextMetadata.find(model => model.id === form.model)?.capacity;
          const capacityLabel = contextState === 'loading' || contextState === 'idle' ? '读取中…' :
            contextState === 'failed' ? '读取失败，请刷新模型' :
            positiveCapacity(capacity) ? `${new Intl.NumberFormat('en-US').format(capacity)} tokens` : '未提供';
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
                h('input', { type: 'checkbox', role: 'switch', 'aria-label': '启用 Codex CLI', checked: form.enabled, disabled: busy || !row, onChange: e => { change('enabled', e.target.checked); setExpanded(true); setActiveTab('settings'); } }),
                h('span', { className: 'hccl-track', 'aria-hidden': true })),
              h('button', { type: 'button', className: 'hccl-config-button', 'aria-expanded': expanded, 'aria-controls': 'hccl-codex-details', onClick: () => setExpanded(value => !value) }, expanded ? '收起' : '展开', h('span', { className: 'hccl-chevron', 'data-open': expanded, 'aria-hidden': true }, '⌄'))),
            h('div', { className: 'hccl-provider-details', id: 'hccl-codex-details', hidden: !expanded },
              h('div', { className: 'hccl-tabs', role: 'tablist', 'aria-label': 'Codex 配置分区' }, tab('settings', '模型'), tab('usage', '套餐与额度')),
              // Keep both panels mounted: folding or switching tabs must not reset quota or dirty settings.
              h('div', { className: 'hccl-body hccl-tabpanel', role: 'tabpanel', id: 'hccl-codex-settings', 'aria-labelledby': 'hccl-codex-tab-settings', tabIndex: 0, hidden: activeTab !== 'settings' },
                h('div', { className: 'hccl-model-head' }, h('h3', null, '模型与行为'), h(RefreshButton, { label: '刷新模型', busy: checking, onClick: check })),
                field('hccl-model', '默认模型', '未指定模型时使用；会话中手动选择的模型优先。',
                  h('div', null, h('select', { id: 'hccl-model', value: form.model, disabled: busy || !row, onChange: e => change('model', e.target.value) }, !known && h('option', { value: form.model }, form.model), ...models.map(m => h('option', { key: m.id, value: m.id }, m.name || m.id))),
                    h('details', { className: 'hccl-advanced' }, h('summary', null, '自定义模型 ID'), h('input', { id: 'hccl-custom-model', 'aria-label': '自定义模型 ID', type: 'text', value: form.model, maxLength: 200, disabled: busy || !row, onChange: e => change('model', e.target.value), placeholder: '输入上游模型 ID' })))),
                h('div', { className: 'hccl-setting' },
                  h('span', { className: 'hccl-label' }, '上下文容量'),
                  h('span', { id: 'hccl-context-capacity', 'aria-live': 'polite' }, capacityLabel)),
                field('hccl-effort', '推理强度', '会话中的显式设置优先于此默认值。',
                  h('select', { id: 'hccl-effort', value: form.reasoningEffort, disabled: busy || !row, onChange: e => change('reasoningEffort', e.target.value) }, ...[['default', '跟随 CLI 默认'], ...(models.find(m => m.id === form.model)?.reasoning?.efforts?.map(e => [e.id, e.name || e.id]) ?? [['none', '无'], ['minimal', '最低'], ['low', '低'], ['medium', '中'], ['high', '高'], ['xhigh', '最高'], ['max', 'Max'], ['ultra', 'Ultra']])].map(([id, label]) => h('option', { key: id, value: id }, label)))),
                h('div', { className: 'hccl-actions' },
                  h('button', { className: 'hccl-primary', disabled: busy || !row || !form.model.trim() || !dirty.current, onClick: save }, busy ? '保存中…' : '保存配置'),
                  dirty.current && h('span', { className: 'hccl-unsaved' }, '有未保存的更改'), h('span', { className: 'hccl-spacer' }),
                  h('button', { className: 'hccl-link', disabled: busy || !row || !form.enabled || dirty.current || !defaults, onClick: makeDefault }, '设为 Harness 默认模型')),
                h('p', { className: 'hccl-helper' }, '使用本机 CLI 的登录与上游配置，凭据由 CLI 管理。配置保存在 Harness 中，不修改本机 CLI 配置。', h('br'), 'Codex CLI 0.166.0 · Python 3.11+'),
                error && h('div', { className: 'hccl-error', role: 'alert' }, error), notice && h('div', { className: 'hccl-ok', role: 'status' }, notice)),
              h('div', { className: 'hccl-tabpanel', role: 'tabpanel', id: 'hccl-codex-usage', 'aria-labelledby': 'hccl-codex-tab-usage', tabIndex: 0, hidden: activeTab !== 'usage' }, h(AccountUsage))));
        }
        const configurationComponents = { codex: CodexConfiguration };
        function Panel() {
          return h('section', { className: 'hccl', 'aria-label': 'Providers 配置' }, h('style', null, css + usageCss),
            h('div', { className: 'hccl-wrap' },
              h('header', { className: 'hccl-header' }, h('h1', null, 'Providers'), h('p', null, '管理模型提供商及其默认配置。'), h('span', { className: 'hccl-version' }, 'v0.3.9')),
              ...PROVIDERS.map(provider => h(configurationComponents[provider.component], { key: provider.id, provider }))));
        }
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, Panel));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 15, label: 'Providers' }, Icon));
      },
    };
  },
});
