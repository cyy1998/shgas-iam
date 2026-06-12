export interface RedirectUrlPattern {
  raw: string;
  protocol: "http:" | "https:";
  hostname: string;
  port: string;
  hostWildcardSuffix: string | null;
  pathMode: "origin" | "subtree" | "wildcard-subtree";
  pathname: string;
}

export class RedirectUrlPatternSyntaxError extends Error {
  constructor(pattern: string, message: string) {
    super(`Invalid redirect URL pattern "${pattern}": ${message}`);
    this.name = "RedirectUrlPatternSyntaxError";
  }
}

export interface RedirectUrlPatternValidationResult {
  ok: boolean;
  error?: string;
}

function parseUrl(value: string, kind: "pattern" | "redirectUrl") {
  try {
    return new URL(value);
  }
  catch {
    throw new RedirectUrlPatternSyntaxError(value, `${kind} must be a valid URL`);
  }
}

function assertSupportedProtocol(pattern: string, url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RedirectUrlPatternSyntaxError(pattern, "protocol must be http or https");
  }
}

function parseProtocol(pattern: string, url: URL): RedirectUrlPattern["protocol"] {
  assertSupportedProtocol(pattern, url);
  return url.protocol as RedirectUrlPattern["protocol"];
}

function parseHostWildcard(pattern: string, hostname: string) {
  const wildcardCount = [...hostname].filter(char => char === "*").length;
  if (wildcardCount === 0) {
    return null;
  }
  if (wildcardCount !== 1 || !hostname.startsWith("*.")) {
    throw new RedirectUrlPatternSyntaxError(pattern, "host wildcard must be the left-most label");
  }

  const suffix = hostname.slice(2);
  if (!suffix.includes(".") || suffix.includes("*") || suffix.startsWith(".") || suffix.endsWith(".")) {
    throw new RedirectUrlPatternSyntaxError(pattern, "host wildcard suffix is too broad or invalid");
  }
  if (suffix.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(suffix)) {
    throw new RedirectUrlPatternSyntaxError(pattern, "host wildcard cannot target an IP address");
  }

  return suffix;
}

function parsePathMode(pattern: string, pathname: string): Pick<RedirectUrlPattern, "pathMode" | "pathname"> {
  const wildcardCount = [...pathname].filter(char => char === "*").length;
  if (wildcardCount === 0) {
    return {
      pathMode: pathname === "/" ? "origin" : "subtree",
      pathname,
    };
  }
  if (wildcardCount === 1 && pathname.endsWith("/*")) {
    return {
      pathMode: "wildcard-subtree",
      pathname: pathname.slice(0, -1),
    };
  }
  throw new RedirectUrlPatternSyntaxError(pattern, "path wildcard is only allowed at the end as /*");
}

export function parseRedirectUrlPattern(pattern: string): RedirectUrlPattern {
  const trimmed = pattern.trim();
  if (trimmed === "" || trimmed === "*") {
    throw new RedirectUrlPatternSyntaxError(pattern, "pattern must not be empty or bare *");
  }

  const url = parseUrl(trimmed, "pattern");
  const protocol = parseProtocol(trimmed, url);
  if (url.search !== "" || url.hash !== "") {
    throw new RedirectUrlPatternSyntaxError(trimmed, "query and hash are not allowed");
  }

  const hostWildcardSuffix = parseHostWildcard(trimmed, url.hostname);
  const path = parsePathMode(trimmed, url.pathname);

  return {
    raw: trimmed,
    protocol,
    hostname: url.hostname,
    port: url.port,
    hostWildcardSuffix,
    ...path,
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
    };
  }
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
  if (pattern.pathMode === "origin") {
    return true;
  }
  if (pattern.pathMode === "wildcard-subtree") {
    return pathname.startsWith(pattern.pathname);
  }

  return pathname === pattern.pathname || pathname.startsWith(`${pattern.pathname}/`);
}

export function matchRedirectUrlPattern(redirectUrl: string, pattern: string | RedirectUrlPattern) {
  const parsedPattern = typeof pattern === "string" ? parseRedirectUrlPattern(pattern) : pattern;
  const url = parseUrl(redirectUrl, "redirectUrl");
  assertSupportedProtocol(redirectUrl, url);

  return url.protocol === parsedPattern.protocol
    && url.port === parsedPattern.port
    && matchesHostname(parsedPattern, url.hostname)
    && matchesPath(parsedPattern, url.pathname);
}

export function isRedirectUrlAllowedByPatterns(redirectUrl: string, patterns: string[]) {
  return patterns.some(pattern => matchRedirectUrlPattern(redirectUrl, pattern));
}
