export function toQueryString(
  params: Record<string, string | number | undefined | null>,
): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    usp.set(k, String(v));
  });
  return usp.toString();
}

export function currentSearchParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

export function getQuery(name: string): string | null {
  return currentSearchParams().get(name);
}

export function decodeRedirect(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
