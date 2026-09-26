// Structured server logging. Never pass request bodies, cookies or tokens in `extra`.
const MAX_MESSAGE_LENGTH = 300;

export function logFailure(event, error, extra = {}) {
  const record = {
    event,
    type: error?.name ?? null,
    message: String(error?.message ?? error ?? '').slice(0, MAX_MESSAGE_LENGTH),
    ...extra,
  };
  console.error(JSON.stringify(record));
  return record;
}

export function logEvent(event, extra = {}) {
  const record = { event, ...extra };
  console.log(JSON.stringify(record));
  return record;
}
