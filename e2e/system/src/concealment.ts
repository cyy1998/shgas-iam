export function containsScalarValue(
  value: unknown,
  forbidden: number | string,
): boolean {
  if (value === forbidden)
    return true;
  if (Array.isArray(value))
    return value.some(item => containsScalarValue(item, forbidden));
  if (typeof value !== "object" || value === null)
    return false;
  return Object.values(value).some(item =>
    containsScalarValue(item, forbidden));
}
