import { restoreFirstPartySsoBrowserNavigation } from '@iam/contracts';

type NavigationHistory = Pick<History, 'state' | 'replaceState'>;
type NavigationEventTarget = Pick<Window, 'dispatchEvent'>;

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

export function restoreLoginRedirectState(
  callbackUrl = window.location.href,
  browserHistory: NavigationHistory = window.history,
  eventTarget: NavigationEventTarget = window,
) {
  return restoreFirstPartySsoBrowserNavigation(
    callbackUrl,
    browserHistory,
    eventTarget,
    PopStateEvent,
  );
}
