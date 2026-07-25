export type DeterministicJobIdPart = string | number | bigint | Date;

export function buildDeterministicJobId(parts: readonly DeterministicJobIdPart[]): string {
  if (parts.length === 0)
    throw new Error("jobId parts must not be empty");

  return parts.map(formatJobIdPart).join("|");
}

export function buildUserJobId(jobName: string, userId: DeterministicJobIdPart): string {
  return buildDeterministicJobId([jobName, userId]);
}

export function buildUserVersionJobId(
  jobName: string,
  userId: DeterministicJobIdPart,
  version: DeterministicJobIdPart,
): string {
  return buildDeterministicJobId([jobName, userId, version]);
}

function formatJobIdPart(part: DeterministicJobIdPart): string {
  const text = part instanceof Date ? part.toISOString() : String(part).trim();

  if (!text)
    throw new Error("jobId parts must be non-empty");

  return encodeURIComponent(text);
}
