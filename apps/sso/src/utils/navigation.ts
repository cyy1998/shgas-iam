import { portalBase } from "@sso/constants/paths";

export function replacePortalLocation(path: `/${string}`) {
  // Requests can redirect from outside React. Notify BrowserRouter about the replacement.
  const state = window.history.state;
  window.history.replaceState(state, "", `${portalBase}${path}`);
  window.dispatchEvent(new PopStateEvent("popstate", { state }));
}
