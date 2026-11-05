// Public, read-only view of Codex account usage. Never serialize raw RPC payloads,
// opaque account/credit IDs, auth state, provider config, or backend errors.
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 120) => typeof value === 'string' && value.trim()
  ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/data:[^\s]+/gi, '[已隐藏]')
    .replace(/\b(?:sk-|Bearer\s+)[A-Za-z0-9._-]+/gi, '[已隐藏]').trim().slice(0, max) : null;
const flag = value => typeof value === 'boolean' ? value : null;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const seconds = value => Number.isSafeInteger(value) && value >= 0 && value <= 253402300799 ? value : null;
const count = value => {
  if (typeof value === 'bigint') return value >= 0n && value <= 9223372036854775807n ? String(value) : null;
  if (Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === 'string' && /^\d{1,20}$/.test(value) && BigInt(value) <= 9223372036854775807n) return String(BigInt(value));
  return null; // Never round an unsafe JSON integer or turn missing values into zero.
};
function maskedEmail(value) {
  if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(value)) return null;
  const [name, domain] = value.split('@');
  return text(`${name[0]}***@${domain}`, 160);
}
export function accountSummary(value) {
  if (!record(value)) return null;
  const type = ['chatgpt', 'apiKey', 'amazonBedrock', 'gcp'].includes(value.type) ? value.type : 'unknown';
  return { type, email: type === 'chatgpt' ? maskedEmail(value.email) : null,
    planType: type === 'chatgpt' ? text(value.planType, 40) : null,
    workspaceName: type === 'chatgpt' ? text(value.workspaceName) : null };
}
function windowSummary(value) {
  if (!record(value)) return null;
  return { usedPercent: finite(value.usedPercent) && value.usedPercent >= 0 ? value.usedPercent : null,
    windowDurationMins: Number.isSafeInteger(value.windowDurationMins) && value.windowDurationMins > 0 ? value.windowDurationMins : null,
    resetsAt: seconds(value.resetsAt) };
}
function creditSummary(value) {
  if (!record(value)) return null;
  return { hasCredits: flag(value.hasCredits), unlimited: flag(value.unlimited),
    balance: typeof value.balance === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.balance) && value.balance.length <= 80 ? value.balance : null };
}
function bucketSummary(value, fallbackId) {
  if (!record(value)) return null;
  return { id: text(value.limitId) ?? text(fallbackId) ?? 'default', name: text(value.limitName),
    primary: windowSummary(value.primary), secondary: windowSummary(value.secondary), credits: creditSummary(value.credits),
    planType: text(value.planType, 40) };
}
function resetSummary(value) {
  if (!record(value)) return { availableCount: null, details: null };
  const details = Array.isArray(value.credits) ? value.credits.slice(0, 100).filter(record).map(credit => ({
    // Deliberately omit ID: this plugin cannot redeem, consume, or manage credits.
    type: credit.resetType === 'codexRateLimits' ? 'codexRateLimits' : 'unknown',
    status: ['available', 'redeeming', 'redeemed'].includes(credit.status) ? credit.status : 'unknown',
    title: text(credit.title), description: text(credit.description, 240),
    grantedAt: seconds(credit.grantedAt), expiresAt: seconds(credit.expiresAt),
    expiryKnown: credit.expiresAt === null || seconds(credit.expiresAt) !== null,
  })) : null;
  return { availableCount: count(value.availableCount), details };
}
export function usageSummary(value) {
  if (!record(value)) throw new Error('Invalid Codex usage response');
  const buckets = [];
  // Prefer the authoritative multi-bucket view. Do not merge its legacy mirror
  // and double-count Codex usage. Fall back only when no usable bucket exists.
  if (record(value.rateLimitsByLimitId)) {
    for (const [id, row] of Object.entries(value.rateLimitsByLimitId).slice(0, 100)) {
      const bucket = bucketSummary(row, id); if (bucket) buckets.push(bucket);
    }
  }
  if (!buckets.length) {
    const legacy = bucketSummary(value.rateLimits, 'default'); if (legacy) buckets.push(legacy);
  }
  if (!buckets.length && !record(value.rateLimitResetCredits) && typeof value.ordinaryUsageAllowed !== 'boolean') {
    throw new Error('Missing Codex usage data');
  }
  return { ordinaryUsageAllowed: flag(value.ordinaryUsageAllowed), rateLimits: buckets,
    resetCredits: resetSummary(value.rateLimitResetCredits) };
}
export const USAGE_MESSAGES = Object.freeze({
  unavailable: '暂时无法读取账号额度。请检查 Codex CLI 的登录、网络或版本后手动刷新。',
  signedOut: '未登录 ChatGPT 账号。请先在 Codex CLI 中完成登录，再刷新额度。',
  unsupported: '当前 CLI 认证方式不提供 ChatGPT 账号额度；API Key、第三方中转或云提供商余额请在对应平台查看。',
  changed: '读取期间账号状态更新或不一致，已丢弃本次额度信息。请重新刷新。',
  unverified: 'CLI 或后端未提供可配对的账号标识，无法确认额度归属。本次不展示额度，请稍后刷新。',
});
export function usageSnapshot(state, account = null, usage = null, now = Date.now()) {
  return { version: 1, state, account, usage, checkedAt: new Date(now).toISOString(),
    message: state === 'ready' ? null : USAGE_MESSAGES[state] ?? USAGE_MESSAGES.unavailable };
}
