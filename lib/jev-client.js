import { logEvent } from './log.js';

// Single client for the TypeSafe System One endpoint (docs.typesafe.ai/api).
// Model pinned to a versioned id so tuned thresholds stay meaningful; `jev-latest` would move.
export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL = 'jev-1.13.0';
const DEFAULT_TIMEOUT_MS = 12000;
const MAX_STATE_BYTES = 28000; // well under the 32k-token state budget
const MAX_BODY_BYTES = 90000; // well under the 64k-token request budget
// Retry ladder: up to four attempts on rate limit, temporary unavailability, overload or a network
// failure. Everything else (401, 422, 500 ...) fails closed at once. The caller's timeoutMs bounds
// the whole ladder, so a slow ladder can never exceed the user-facing wait it was given.
export const MAX_ATTEMPTS = 4;
const RETRY_STATUSES = new Set([429, 503, 529]);
const NETWORK_ERRORS = new Set(['AbortError', 'TimeoutError', 'TypeError']);
const BACKOFF_BASE_MS = 200;
const BACKOFF_CAP_MS = 4000;
const JITTER_RATIO = 0.2;
const RETRY_AFTER_CAP_MS = 8000;
const ERROR_BODY_CHARS = 200;
const MIN_SCRUB_KEY_LENGTH = 8; // shorter keys would redact ordinary characters

export class JevError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
  }
}

// Credentials must never reach logs or error messages: bearer tokens, `key=...` pairs and long
// opaque tokens are replaced before an upstream message bubbles up.
export function scrubSecrets(text, key = '') {
  let out = String(text ?? '');
  if (typeof key === 'string' && key.length >= MIN_SCRUB_KEY_LENGTH) out = out.split(key).join('[REDACTED]');
  return out
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b((?:api[_-]?)?key|token|secret)(\s*[=:]\s*)[A-Za-z0-9._~+/=-]{6,}/gi, '$1$2[REDACTED]')
    .replace(/\b(?:sk|ts|key)[-_][A-Za-z0-9_-]{8,}/g, '[REDACTED]')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[REDACTED]');
}

const backoffDelay = (attempt, random) => {
  const base = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS);
  const jitter = (random() * 2 - 1) * JITTER_RATIO; // uniform in [-20%, +20%]
  return Math.round(base * (1 + jitter));
};
const retryAfterDelay = response => {
  const raw = response?.headers?.get?.('retry-after');
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, RETRY_AFTER_CAP_MS) : null;
};
const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function errorExcerpt(response, key) {
  try {
    const text = typeof response?.text === 'function' ? await response.text() : '';
    // Scrub before slicing: a token straddling the cut would otherwise leak a fragment.
    return text ? ': ' + scrubSecrets(String(text), key).slice(0, ERROR_BODY_CHARS) : '';
  } catch {
    return '';
  }
}

async function attemptOnce({ fetcher, key, body, signal, remainingMs }) {
  const timeout = AbortSignal.timeout(remainingMs);
  try {
    return await fetcher(JEV_ENDPOINT, {
      method: 'POST',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body,
    });
  } catch (error) {
    // Network and timeout failures fail closed; anything else is a programming error and must surface.
    if (NETWORK_ERRORS.has(error?.name))
      return { networkError: new JevError('unavailable', scrubSecrets(error.message, key)) };
    throw error;
  }
}

export async function askJev({
  key,
  state,
  questions,
  fetcher = fetch,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxStateBytes = MAX_STATE_BYTES,
  maxBodyBytes = MAX_BODY_BYTES,
  purpose = 'jev',
  sleeper = defaultSleep,
  random = Math.random,
  now = Date.now,
}) {
  if (!key) throw new JevError('unavailable', 'JEV key missing');
  const body = JSON.stringify({ model: JEV_MODEL, state, questions });
  if (Buffer.byteLength(JSON.stringify(state)) > maxStateBytes || Buffer.byteLength(body) > maxBodyBytes)
    throw new JevError('input_limit', 'JEV input limit');
  const started = now();
  const deadline = started + timeoutMs;
  let response;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const remainingMs = deadline - now();
    if (remainingMs <= 0) throw new JevError('unavailable', 'JEV timeout budget exhausted');
    const outcome = await attemptOnce({ fetcher, key, body, signal, remainingMs });
    let failure;
    if (outcome.networkError) failure = outcome.networkError;
    else if (outcome.ok) {
      response = outcome;
      break;
    } else {
      failure = new JevError('unavailable', `JEV HTTP ${outcome.status}${await errorExcerpt(outcome, key)}`);
      if (!RETRY_STATUSES.has(outcome.status)) throw failure;
    }
    if (attempt === MAX_ATTEMPTS) throw failure;
    const delay = retryAfterDelay(outcome.networkError ? null : outcome) ?? backoffDelay(attempt, random);
    // Never sleep past the caller's budget: fail closed now rather than after a pointless wait.
    if (now() + delay >= deadline) throw failure;
    await sleeper(delay);
  }
  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new JevError('invalid_response', scrubSecrets(error?.message, key));
  }
  if (!data || typeof data.answers !== 'object' || data.answers === null)
    throw new JevError('invalid_response', 'answers missing');
  logEvent('jev_call', {
    purpose,
    model: data.model ?? null,
    questions: Object.keys(questions).length,
    inputTokens: data.usage?.input_tokens ?? null,
    durationMs: now() - started,
  });
  return { answers: data.answers, model: data.model ?? JEV_MODEL, usage: data.usage ?? null };
}

const isProbability = value => Number.isFinite(value) && value >= 0 && value <= 1;

// Validates one Choice answer against the options we asked for. The per-option distribution is kept
// (when well formed) for the calibration ledger; it never influences a verdict.
export function choiceAnswer(answer, options) {
  const valid = answer?.type === 'choice' && options.includes(answer.choice) && isProbability(answer.confidence);
  if (!valid) return null;
  const distribution = answer.probabilities;
  const probabilities =
    distribution && typeof distribution === 'object' && Object.values(distribution).every(isProbability)
      ? Object.fromEntries(options.map(option => [option, distribution[option] ?? 0]))
      : null;
  return { choice: answer.choice, confidence: answer.confidence, probabilities };
}

// Validates one Noul answer: the probability that the judged condition holds.
export function noulAnswer(answer) {
  return answer?.type === 'noul' && isProbability(answer.noul) ? { probability: answer.noul } : null;
}
