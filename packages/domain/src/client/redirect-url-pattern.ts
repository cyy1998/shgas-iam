import { getPublicSuffix } from "tldts";

export interface RedirectUrlPattern {
  raw: string;
  protocol: "http:" | "https:";
  hostname: string;
  port: string;
  hostWildcardSuffix: string | null;
  pathMode: "exact" | "wildcard-subtree";
  pathname: string;
  fragment: string | null;
}

export const RedirectUrlPatternFailureReasons = {
  DynamicQuery: "query_not_allowed",
  EmptyOrBareWildcard: "empty_or_bare_wildcard",
  HostWildcardInvalid: "host_wildcard_invalid",
  HostWildcardIp: "host_wildcard_ip_not_allowed",
  HostWildcardPublicSuffix: "host_wildcard_public_or_private_suffix",
  InvalidUrl: "invalid_url",
  PathWildcardInvalid: "path_wildcard_invalid",
  UnsupportedProtocol: "unsupported_protocol",
  UrlCredentials: "url_credentials_not_allowed",
} as const;

export type RedirectUrlPatternFailureReason
  = typeof RedirectUrlPatternFailureReasons[
    keyof typeof RedirectUrlPatternFailureReasons
  ];

export class RedirectUrlPatternSyntaxError extends Error {
  readonly reason: RedirectUrlPatternFailureReason;

  constructor(reason: RedirectUrlPatternFailureReason) {
    super(`Invalid redirect URL pattern: ${reason}`);
    this.name = "RedirectUrlPatternSyntaxError";
    this.reason = reason;
  }
}

export interface RedirectUrlPatternValidationResult {
  ok: boolean;
  error?: string;
  reason?: RedirectUrlPatternFailureReason;
}

function parseUrl(value: string) {
  try {
    return new URL(value);
  }
  catch {
    throw new RedirectUrlPatternSyntaxError(
      RedirectUrlPatternFailureReasons.InvalidUrl,
    );
  }
}

function assertNoRawUserinfo(value: string) {
  const authority = /^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/iu.exec(
    value.trim(),
  )?.[1];
  if (authority?.includes("@")) {
    throw new RedirectUrlPatternSyntaxError(
      RedirectUrlPatternFailureReasons.UrlCredentials,
    );
  }
}

function assertSupportedProtocol(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RedirectUrlPatternSyntaxError(
      RedirectUrlPatternFailureReasons.UnsupportedProtocol,
    );
  }
}

function parseProtocol(url: URL): RedirectUrlPattern["protocol"] {
  assertSupportedProtocol(url);
  return url.protocol as RedirectUrlPattern["protocol"];
}

function parseHostWildcard(hostname: string) {
  const wildcardCount = [...hostname].filter(char => char === "*").length;
  if (wildcardCount === 0) {
    return null;
  }
  if (wildcardCount !== 1 || !hostname.startsWith("*.")) {
    throw new RedirectUrlPatternSyntaxError(
      RedirectUrlPatternFailureReasons.HostWildcardInvalid,
    );
  }

  const suffix = hostname.slice(2);
  if (!suffix.includes(".") || suffix.includes("*") || suffix.startsWith(".") || suffix.endsWith(".")) {
    throw new RedirectUrlPatternSyntaxError(
      RedirectUrlPatternFailureReasons.HostWildcardInvalid,
    );
  }
  if (suffix.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(suffix)) {
    throw new RedirectUrlPatternSyntaxError(
      RedirectUrlPatternFailureReasons.HostWildcardIp,
    );
  }
  if (getPublicSuffix(suffix, { allowPrivateDomains: true }) === suffix) {
    throw new RedirectUrlPatternSyntaxError(
      RedirectUrlPatternFailureReasons.HostWildcardPublicSuffix,
    );
  }

  return suffix;
}

function parsePathMode(pathname: string): Pick<RedirectUrlPattern, "pathMode" | "pathname"> {
  const wildcardCount = [...pathname].filter(char => char === "*").length;
  if (wildcardCount === 0) {
    return {
      pathMode: "exact",
      pathname,
    };
  }
  if (wildcardCount === 1 && pathname.endsWith("/*")) {
    return {
      pathMode: "wildcard-subtree",
      pathname: pathname.slice(0, -1),
    };
  }
  throw new RedirectUrlPatternSyntaxError(
    RedirectUrlPatternFailureReasons.PathWildcardInvalid,
  );
}

export function parseRedirectUrlPattern(pattern: string): RedirectUrlPattern {
  const trimmed = pattern.trim();
  if (trimmed === "" || trimmed === "*") {
    throw new RedirectUrlPatternSyntaxError(
      RedirectUrlPatternFailureReasons.EmptyOrBareWildcard,
    );
  }
  if (trimmed.split("#", 1)[0]!.includes("?")) {
    throw new RedirectUrlPatternSyntaxError(
      RedirectUrlPatternFailureReasons.DynamicQuery,
    );
  }

  assertNoRawUserinfo(trimmed);
  const url = parseUrl(trimmed);
  const protocol = parseProtocol(url);
  if (url.username !== "" || url.password !== "") {
    throw new RedirectUrlPatternSyntaxError(
      RedirectUrlPatternFailureReasons.UrlCredentials,
    );
  }
  if (url.search !== "") {
    throw new RedirectUrlPatternSyntaxError(
      RedirectUrlPatternFailureReasons.DynamicQuery,
    );
  }

  const hostWildcardSuffix = parseHostWildcard(url.hostname);
  const path = parsePathMode(url.pathname);

  return {
    raw: trimmed,
    protocol,
    hostname: url.hostname,
    port: url.port,
    hostWildcardSuffix,
    ...path,
    fragment: trimmed.includes("#") ? url.href.slice(url.href.indexOf("#")) : null,
  };
}

export function validateRedirectUrlPattern(pattern: string): RedirectUrlPatternValidationResult {
  try {
    parseRedirectUrlPattern(pattern);
    return { ok: true };
  }
  catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid redirect URL pattern",
      reason: err instanceof RedirectUrlPatternSyntaxError
        ? err.reason
        : RedirectUrlPatternFailureReasons.InvalidUrl,
    };
  }
}

export function normalizeRedirectUrl(redirectUrl: string) {
  assertNoRawUserinfo(redirectUrl);
  const url = parseUrl(redirectUrl);
  assertSupportedProtocol(url);
  if (url.username !== "" || url.password !== "") {
    throw new RedirectUrlPatternSyntaxError(
      RedirectUrlPatternFailureReasons.UrlCredentials,
    );
  }
  return url.toString();
}

function matchesHostname(pattern: RedirectUrlPattern, hostname: string) {
  if (pattern.hostWildcardSuffix === null) {
    return hostname === pattern.hostname;
  }

  const suffix = `.${pattern.hostWildcardSuffix}`;
  if (!hostname.endsWith(suffix)) {
    return false;
  }

  const label = hostname.slice(0, -suffix.length);
  return label !== "" && !label.includes(".");
}

function matchesPath(pattern: RedirectUrlPattern, pathname: string) {
  if (pattern.pathMode === "wildcard-subtree") {
    return pathname.startsWith(pattern.pathname);
  }

  return pathname === pattern.pathname;
}

function hasWildcard(pattern: RedirectUrlPattern) {
  return pattern.hostWildcardSuffix !== null || pattern.pathMode === "wildcard-subtree";
}

export function matchRedirectUrlPattern(redirectUrl: string, pattern: string | RedirectUrlPattern) {
  const parsedPattern = typeof pattern === "string" ? parseRedirectUrlPattern(pattern) : pattern;
  const normalizedRedirectUrl = normalizeRedirectUrl(redirectUrl);
  const url = new URL(normalizedRedirectUrl);

  return url.protocol === parsedPattern.protocol
    && url.port === parsedPattern.port
    && matchesHostname(parsedPattern, url.hostname)
    && matchesPath(parsedPattern, url.pathname)
    && (parsedPattern.fragment === null
      || (url.href.includes("#") ? url.href.slice(url.href.indexOf("#")) : null) === parsedPattern.fragment)
    && (!normalizedRedirectUrl.split("#", 1)[0]!.includes("?") || hasWildcard(parsedPattern));
}

export function isRedirectUrlAllowedByPatterns(redirectUrl: string, patterns: string[]) {
  return patterns.some(pattern => matchRedirectUrlPattern(redirectUrl, pattern));
}
