/** A browser navigation path must not be interpretable as a different authority. */
export function isRootRelativeNavigation(value: string): boolean {
  if (
    !value.startsWith("/") || value.startsWith("//") || /[\s\\]/u.test(value)
    || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    return false;
  }
  const pathname = value.split(/[?#]/u)[0]!;
  if (/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/iu.test(pathname))
    return false;
  const parsed = new URL(value, "https://navigation.invalid");
  return parsed.origin === "https://navigation.invalid" && !parsed.pathname.startsWith("//");
}

export function appendNavigationParameters(path: string, parameters: URLSearchParams): string {
  if (!isRootRelativeNavigation(path))
    throw new Error("IAM navigation requires a safe root-relative path");
  const target = new URL(path, "https://navigation.invalid");
  parameters.forEach((value, key) => target.searchParams.set(key, value));
  return `${target.pathname}${target.search}${target.hash}`;
}
