import type { IncomingMessage } from "node:http";

export const OIDC_REQUEST_ROUTE_SYMBOL = Symbol("iam.oidcRoute");

export function setOidcRoute(request: IncomingMessage, route: string) {
  const requestWithOidcRoute = request as IncomingMessage & { [OIDC_REQUEST_ROUTE_SYMBOL]?: string };
  requestWithOidcRoute[OIDC_REQUEST_ROUTE_SYMBOL] = route;
}

export function getOidcRoute(request: IncomingMessage) {
  return (request as IncomingMessage & { [OIDC_REQUEST_ROUTE_SYMBOL]?: string })[OIDC_REQUEST_ROUTE_SYMBOL];
}
