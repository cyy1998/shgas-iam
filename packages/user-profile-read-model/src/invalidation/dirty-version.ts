const DIRTY_VERSION_PATTERN = /^[1-9]\d*$/u;

export function formatDirtyVersion(value: string | number | bigint): string {
  if (typeof value === "string") {
    const text = value.trim();
    if (!DIRTY_VERSION_PATTERN.test(text))
      throw new Error("dirtyVersion must be a positive decimal string");
    return text;
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error("dirtyVersion number must be a positive safe integer");
    return String(value);
  }

  if (value <= 0n)
    throw new Error("dirtyVersion bigint must be positive");
  return value.toString();
}

export function parseDirtyVersion(value: string) {
  return formatDirtyVersion(value);
}
