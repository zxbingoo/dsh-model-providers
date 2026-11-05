import test from 'node:test';
import assert from 'node:assert/strict';
import { accountSummary, usageSummary, usageSnapshot, USAGE_MESSAGES } from '../account-usage.mjs';

const bucket = overrides => ({
  limitId: 'codex', limitName: 'Codex', planType: 'plus',
  primary: { usedPercent: 12.5, windowDurationMins: 300, resetsAt: 1800000000 },
  secondary: null, credits: { hasCredits: true, unlimited: false, balance: '12.3400' },
  ...overrides,
});
const reset = availableCount => usageSummary({ rateLimitResetCredits: { availableCount } }).resetCredits.availableCount;

test('accountSummary whitelists fields and masks the email rather than exposing identity/auth data', () => {
  const raw = { type: 'chatgpt', email: 'alice@example.test', planType: 'plus', workspaceName: 'Review',
    accountId: 'PRIVATE_ACCOUNT_ID', token: 'PRIVATE_TOKEN', auth: { secret: 'PRIVATE_AUTH' },
    provider: { baseUrl: 'PRIVATE_CONFIG' }, upsell: 'PRIVATE_UPSELL' };
  assert.deepEqual(accountSummary(raw), {
    type: 'chatgpt', email: 'a***@example.test', planType: 'plus', workspaceName: 'Review',
  });
  assert.doesNotMatch(JSON.stringify(accountSummary(raw)), /alice@|PRIVATE_/);
});

test('accountSummary treats malformed accounts/emails as unknown, never as signed-in identity', () => {
  for (const value of [undefined, null, false, 0, 'chatgpt', []]) assert.equal(accountSummary(value), null);
  for (const email of [undefined, null, '', 'alice', 'a@@example.test', 'a b@example.test', 1]) {
    assert.equal(accountSummary({ type: 'chatgpt', email }).email, null);
  }
  for (const type of ['apiKey', 'amazonBedrock', 'gcp', 'future-provider', undefined]) {
    assert.deepEqual(accountSummary({ type, email: 'alice@example.test', planType: 'plus', workspaceName: 'Review' }), {
      type: ['apiKey', 'amazonBedrock', 'gcp'].includes(type) ? type : 'unknown',
      email: null, planType: null, workspaceName: null,
    });
  }
});

test('account display fields are bounded and strip controls/known credential patterns', () => {
  const summary = accountSummary({ type: 'chatgpt', email: 'a@example.test',
    planType: 'x'.repeat(100), workspaceName: '\u0000Review\nBearer secret-token sk-secret data:text/plain,SECRET' });
  assert.equal(summary.planType.length, 40);
  assert.doesNotMatch(summary.workspaceName, /[\u0000-\u001f\u007f]|secret-token|sk-secret|SECRET/);
  assert.equal(accountSummary({ type: 'chatgpt', planType: {}, workspaceName: '' }).workspaceName, null);
});

test('usageSummary prefers rateLimitsByLimitId and never duplicates the legacy mirror', () => {
  const summary = usageSummary({ accountId: 'PRIVATE_ACCOUNT', rateLimits: bucket({ limitName: 'LEGACY' }),
    rateLimitsByLimitId: { codex: bucket(), review: bucket({ limitId: undefined, limitName: 'Review' }) } });
  assert.equal(summary.rateLimits.length, 2);
  assert.deepEqual(summary.rateLimits.map(row => row.id), ['codex', 'review']);
  assert.deepEqual(summary.rateLimits[0], {
    id: 'codex', name: 'Codex', planType: 'plus',
    primary: { usedPercent: 12.5, windowDurationMins: 300, resetsAt: 1800000000 }, secondary: null,
    credits: { hasCredits: true, unlimited: false, balance: '12.3400' },
  });
  assert.equal(summary.ordinaryUsageAllowed, null);
  assert.deepEqual(summary.resetCredits, { availableCount: null, details: null });
  assert.doesNotMatch(JSON.stringify(summary), /LEGACY|PRIVATE_ACCOUNT/);
});

test('usageSummary falls back to legacy only when no usable multi-bucket row exists', () => {
  for (const rateLimitsByLimitId of [undefined, null, [], {}, { invalid: null, array: [], number: 2 }]) {
    const summary = usageSummary({ rateLimitsByLimitId, rateLimits: bucket({ limitId: undefined }) });
    assert.equal(summary.rateLimits.length, 1);
    assert.equal(summary.rateLimits[0].id, 'default');
  }
  assert.equal(usageSummary({ rateLimitsByLimitId: { good: {}, bad: [] }, rateLimits: bucket() }).rateLimits.length, 1);
});

test('usageSummary rejects missing payloads but preserves explicit boolean/credit-only data', () => {
  for (const value of [undefined, null, false, 12, 'secret', [], {}, { rateLimits: [] }, { rateLimitsByLimitId: [] }]) {
    assert.throws(() => usageSummary(value), /Invalid Codex usage response|Missing Codex usage data/);
  }
  assert.deepEqual(usageSummary({ ordinaryUsageAllowed: false }), {
    ordinaryUsageAllowed: false, rateLimits: [], resetCredits: { availableCount: null, details: null },
  });
  assert.equal(usageSummary({ ordinaryUsageAllowed: true }).ordinaryUsageAllowed, true);
  assert.equal(usageSummary({ rateLimitResetCredits: {} }).ordinaryUsageAllowed, null);
});

test('window and credit fields are nullable, not coerced or guessed', () => {
  const summary = usageSummary({ rateLimits: bucket({
    primary: { usedPercent: -1, windowDurationMins: 0, resetsAt: -1 },
    secondary: { usedPercent: Infinity, windowDurationMins: '300', resetsAt: '1800000000' },
    credits: { hasCredits: 1, unlimited: 'false', balance: 12 },
  }) }).rateLimits[0];
  assert.deepEqual(summary.primary, { usedPercent: null, windowDurationMins: null, resetsAt: null });
  assert.deepEqual(summary.secondary, { usedPercent: null, windowDurationMins: null, resetsAt: null });
  assert.deepEqual(summary.credits, { hasCredits: null, unlimited: null, balance: null });
  const valid = usageSummary({ rateLimits: bucket({ primary: { usedPercent: 0, windowDurationMins: 1, resetsAt: 0 } }) });
  assert.deepEqual(valid.rateLimits[0].primary, { usedPercent: 0, windowDurationMins: 1, resetsAt: 0 });
  for (const value of [NaN, 1.5, 253402300800, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(usageSummary({ rateLimits: bucket({ primary: { resetsAt: value } }) }).rateLimits[0].primary.resetsAt, null);
  }
});

test('credit balances remain exact strings without inferred currency', () => {
  for (const balance of ['0', '-0.125', '12345678901234567890.00001']) {
    const credits = usageSummary({ rateLimits: bucket({ credits: { balance } }) }).rateLimits[0].credits;
    assert.deepEqual(credits, { hasCredits: null, unlimited: null, balance });
    assert.equal('currency' in credits, false);
  }
  for (const balance of [null, 0, NaN, 'USD 10', '$10', '1e3', 'Infinity', '1'.repeat(81)]) {
    assert.equal(usageSummary({ rateLimits: bucket({ credits: { balance } }) }).rateLimits[0].credits.balance, null);
  }
});

test('reset availableCount is a nonnegative i64 string; unsafe JSON numbers are unknown', () => {
  for (const [input, expected] of [[0, '0'], [3, '3'], [Number.MAX_SAFE_INTEGER, '9007199254740991'],
    [0n, '0'], [9223372036854775807n, '9223372036854775807'],
    ['9223372036854775807', '9223372036854775807'], ['00042', '42']]) {
    assert.equal(reset(input), expected);
  }
  for (const value of [undefined, null, false, -1, -1n, '-1', 1.5, NaN, Infinity,
    Number.MAX_SAFE_INTEGER + 1, 9223372036854775808n, '9223372036854775808', '', '1.0', '1e3', {}, []]) {
    assert.equal(reset(value), null, `count ${String(value)} must stay unknown`);
  }
});

test('reset-card list length is not an available count; explicit zero is distinguishable from unknown', () => {
  const credits = [{ status: 'available' }, { status: 'available' }, { status: 'redeemed' }];
  const missing = usageSummary({ rateLimitResetCredits: { credits } }).resetCredits;
  assert.equal(missing.availableCount, null);
  assert.equal(missing.details.length, 3);
  assert.equal(usageSummary({ rateLimitResetCredits: { credits, availableCount: 0 } }).resetCredits.availableCount, '0');
  assert.equal(usageSummary({ rateLimitResetCredits: { credits: {} } }).resetCredits.details, null);
});

test('reset-card expiryKnown distinguishes no expiry from invalid/missing expiry', () => {
  const values = [null, 0, 1800000000, undefined, -1, '1800000000', NaN, Infinity, 253402300800];
  const details = usageSummary({ rateLimitResetCredits: {
    credits: values.map(expiresAt => ({ resetType: 'codexRateLimits', status: 'available', expiresAt })),
  } }).resetCredits.details;
  assert.deepEqual(details.map(row => row.expiryKnown), [true, true, true, false, false, false, false, false, false]);
  assert.deepEqual(details.map(row => row.expiresAt), [null, 0, 1800000000, null, null, null, null, null, null]);
});

test('usage whitelist drops IDs, upsell, token and config fields recursively and detaches public data', () => {
  const secret = 'DO_NOT_EXPOSE';
  const raw = { accountId: secret, token: secret, config: secret, upsell: secret,
    rateLimitsByLimitId: { codex: bucket({ accountId: secret, token: secret, upsell: secret,
      primary: { usedPercent: 4, token: secret }, credits: { balance: '9', creditId: secret, token: secret } }) },
    rateLimitResetCredits: { availableCount: '2', token: secret, credits: [{
      id: secret, creditId: secret, accountId: secret, token: secret, config: secret, upsell: secret,
      resetType: 'future', status: 'future', title: 'Reset', description: 'Read-only', grantedAt: 0, expiresAt: null,
    }] },
  };
  const summary = usageSummary(raw);
  assert.deepEqual(summary.resetCredits.details[0], {
    type: 'unknown', status: 'unknown', title: 'Reset', description: 'Read-only',
    grantedAt: 0, expiresAt: null, expiryKnown: true,
  });
  assert.doesNotMatch(JSON.stringify(summary), /DO_NOT_EXPOSE|accountId|creditId|upsell|token|config/);
  raw.rateLimitsByLimitId.codex.primary.usedPercent = 99;
  raw.rateLimitResetCredits.credits[0].title = 'Changed';
  assert.equal(summary.rateLimits[0].primary.usedPercent, 4);
  assert.equal(summary.resetCredits.details[0].title, 'Reset');
});

test('usageSummary bounds both bucket and reset-card lists to 100 records', () => {
  const summary = usageSummary({
    rateLimitsByLimitId: Object.fromEntries(Array.from({ length: 130 }, (_, index) => [`limit-${index}`, bucket({ limitId: undefined })])),
    rateLimitResetCredits: { availableCount: '500', credits: Array.from({ length: 130 }, () => ({ status: 'available', expiresAt: null })) },
  });
  assert.equal(summary.rateLimits.length, 100);
  assert.equal(summary.resetCredits.details.length, 100);
  assert.equal(summary.resetCredits.availableCount, '500');
  assert.equal(usageSummary({ rateLimitResetCredits: { credits: [null, [], false, {}, {}] } }).resetCredits.details.length, 2);
});

test('usageSnapshot exposes only the public envelope and fixed state messages', () => {
  const at = 1800000000000;
  assert.deepEqual(usageSnapshot('ready', null, null, at), {
    version: 1, state: 'ready', account: null, usage: null, checkedAt: new Date(at).toISOString(), message: null,
  });
  for (const state of ['signedOut', 'unsupported', 'changed', 'unverified', 'unavailable']) {
    const snapshot = usageSnapshot(state, null, null, at);
    assert.equal(snapshot.message, USAGE_MESSAGES[state]);
    assert.deepEqual(Object.keys(snapshot).sort(), ['account', 'checkedAt', 'message', 'state', 'usage', 'version']);
  }
  assert.equal(usageSnapshot('unknown', null, null, at).message, USAGE_MESSAGES.unavailable);
});
