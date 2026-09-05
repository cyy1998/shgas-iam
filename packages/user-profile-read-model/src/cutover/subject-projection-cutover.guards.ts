export function assertSubjectProjectionPage(
  page: ReadonlyArray<{ userId: number }>,
  afterUserId: number,
  batchSize: number,
) {
  if (page.length > batchSize)
    throw new Error("Subject Projection cutover page exceeded the requested batch size");
  let previous = afterUserId;
  for (const row of page) {
    if (!Number.isSafeInteger(row.userId) || row.userId <= previous)
      throw new Error("Subject Projection cutover page must be strictly ordered by user ID");
    previous = row.userId;
  }
}

export function requirePositiveSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`${name} must be a positive safe integer`);
}

export function requireNonNegativeSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${name} must be a non-negative safe integer`);
}
