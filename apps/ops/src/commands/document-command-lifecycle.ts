export function parseDocumentCommandDeadline(value: string | undefined) {
  const deadlineMs = value === undefined ? 30_000 : Number(value);
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 300_000)
    throw new RangeError("deadline-ms must be between 1 and 300000");
  return deadlineMs;
}
