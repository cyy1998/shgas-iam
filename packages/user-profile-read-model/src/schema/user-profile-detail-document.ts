const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const PROFILE_DETAIL_DATE_KEYS = new Set(["createTime", "updateTime", "startTime", "endTime"]);

export function reviveUserProfileDetailDates(value: unknown, key?: string): unknown {
  if (
    typeof value === "string"
    && key !== undefined
    && PROFILE_DETAIL_DATE_KEYS.has(key)
    && ISO_DATE_REGEX.test(value)
  ) {
    return new Date(value);
  }

  if (value instanceof Date || value === null || typeof value !== "object")
    return value;

  if (Array.isArray(value))
    return value.map(item => reviveUserProfileDetailDates(item));

  return Object.fromEntries(
    Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      reviveUserProfileDetailDates(childValue, childKey),
    ]),
  );
}
