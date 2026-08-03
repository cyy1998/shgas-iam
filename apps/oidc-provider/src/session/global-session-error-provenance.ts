const globalSessionCookieErrors = new WeakSet<object>();

export function markGlobalSessionCookieError<T>(error: T): T {
  if (typeof error === "object" && error !== null)
    globalSessionCookieErrors.add(error);
  return error;
}

export function isGlobalSessionCookieError(error: unknown) {
  return typeof error === "object"
    && error !== null
    && globalSessionCookieErrors.has(error);
}
