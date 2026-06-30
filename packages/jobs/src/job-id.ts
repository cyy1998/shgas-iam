export type DeterministicJobIdPart = string | number | bigint | Date;

export interface ScopeBucketJobIdInput {
  jobName: string;
  scopeType: string;
  scopeId: DeterministicJobIdPart;
  bucket: DeterministicJobIdPart;
}

export function buildDeterministicJobId(parts: readonly DeterministicJobIdPart[]): string {
  if (parts.length === 0)
    throw new Error("jobId parts must not be empty");

  return parts.map(formatJobIdPart).join(":");
}

export function buildUserJobId(jobName: string, userId: DeterministicJobIdPart): string {
  return buildDeterministicJobId([jobName, userId]);
}

export function buildScopeBucketJobId(input: ScopeBucketJobIdInput): string {
  return buildDeterministicJobId([input.jobName, input.scopeType, input.scopeId, input.bucket]);
}

function formatJobIdPart(part: DeterministicJobIdPart): string {
  const text = part instanceof Date ? part.toISOString() : String(part).trim();

  if (!text)
    throw new Error("jobId parts must be non-empty");

  return text;
}
