const FIRST_PARTY_NAVIGATION_STATE_PREFIX
  = "iam-first-party-navigation:v1:";

export interface FirstPartySsoNavigation {
  redirectUrl: string;
  state?: string;
}

export interface FirstPartySsoBrowserHistory {
  readonly state: unknown;
  readonly replaceState: (
    historyState: unknown,
    unused: string,
    destination: string,
  ) => void;
}

export interface FirstPartySsoBrowserEventTarget<TEvent> {
  readonly dispatchEvent: (event: TEvent) => unknown;
}

export interface FirstPartySsoPopStateEventConstructor<TEvent> {
  new (type: "popstate", init: { readonly state: unknown }): TEvent;
}

export function splitFirstPartySsoNavigation(
  currentUrl: string,
): FirstPartySsoNavigation {
  const url = new URL(currentUrl);
  const dynamicLocation = `${url.search}${url.hash}`;
  url.search = "";
  url.hash = "";

  return {
    redirectUrl: url.toString(),
    ...(dynamicLocation === ""
      ? {}
      : {
          state: `${FIRST_PARTY_NAVIGATION_STATE_PREFIX}${dynamicLocation}`,
        }),
  };
}

export function resolveFirstPartySsoNavigation(
  callbackUrl: string,
): string | null {
  const url = new URL(callbackUrl);
  if (!url.searchParams.get("token")) {
    return null;
  }

  const state = url.searchParams.get("state");
  if (!state?.startsWith(FIRST_PARTY_NAVIGATION_STATE_PREFIX)) {
    return null;
  }

  const dynamicLocation = state.slice(
    FIRST_PARTY_NAVIGATION_STATE_PREFIX.length,
  );
  if (
    dynamicLocation === ""
    || (dynamicLocation[0] !== "?" && dynamicLocation[0] !== "#")
    || /[\r\n]/u.test(dynamicLocation)
  ) {
    return null;
  }

  return `${url.pathname}${dynamicLocation}`;
}

export function restoreFirstPartySsoBrowserNavigation<TEvent>(
  callbackUrl: string,
  browserHistory: FirstPartySsoBrowserHistory,
  eventTarget: FirstPartySsoBrowserEventTarget<TEvent>,
  PopStateEventConstructor: FirstPartySsoPopStateEventConstructor<TEvent>,
): boolean {
  let destination: string | null;
  try {
    destination = resolveFirstPartySsoNavigation(callbackUrl);
  }
  catch {
    return false;
  }
  if (destination === null)
    return false;

  browserHistory.replaceState(browserHistory.state, "", destination);
  eventTarget.dispatchEvent(new PopStateEventConstructor("popstate", {
    state: browserHistory.state,
  }));
  return true;
}
