import { stripVTControlCharacters } from "node:util";

const redacted = "[REDACTED]";
const secretName =
  "(?:authorization|proxy[-_]?authorization|(?:set[-_]?)?cookie|(?:[a-z0-9_-]*)(?:password|passwd|secret|token|credentials?|private[-_]?key|api[-_]?key|key[-_]?material|code[-_]?verifier|client[-_]?assertion)|code|(?:authorization|verification|auth|sms|captcha)[-_]?code|nonce|otp|challenge[-_]?solution)";
const labeledSecret = new RegExp(`(^|[^a-z0-9_-])(${secretName})["']?[ \\t]*[:=][ \\t]*[^\\n]*`, "gimu");

export function reportSecrets(environment: NodeJS.ProcessEnv) {
  const names = /(?:PASSWORD|SECRET|TOKEN|CREDENTIAL|PRIVATE_KEY|API_KEY)(?:_|$)/u;
  return [
    ...new Set(
      Object.entries(environment).flatMap(([name, value]) =>
        name.startsWith("IAM_") && names.test(name) && value ? [value] : [],
      ),
    ),
  ].sort((left, right) => right.length - left.length);
}

export function sanitizeReportUrl(raw: string) {
  const path = raw.split(/[?#]/u, 1)[0] ?? "";
  return path
    .replace(/^([a-z][a-z\d+.-]*:\/\/)[^/]*@/iu, "$1")
    .replace(
      /(\/(?:sso|oidc|(?:api\/iam\/)?auth)\/wechat-qr\/(?:mobile(?:\/confirm)?\/)?)(?!callback(?:\/|$)|decision(?:\/|$)|init(?:\/|$)|start(?:\/|$))[^/\s]+/giu,
      "$1:id",
    );
}

export function sanitizeReportText(value: string, secrets: readonly string[], limit = 2_000) {
  // Redact before truncating, including credentials near the output boundary.
  if (value.length > 64 * 1024) return "[oversized diagnostic omitted]";
  let safe = stripVTControlCharacters(value)
    .replace(/\\(["'])/gu, "$1")
    .replace(/\r\n?/gu, "\n");
  for (const secret of secrets) {
    safe = safe.replaceAll(secret, redacted).replaceAll(encodeURIComponent(secret), redacted);
  }
  return safe
    .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/gu, redacted)
    .replace(/\b[a-z][a-z\d+.-]*:\/\/[^\s"'<>]+/giu, sanitizeReportUrl)
    .replace(
      /(^|[\s"'(])((?:\/[^\s"'<>]*?)[?#][^\s"'<>]*)/gmu,
      (_value, prefix, url) => prefix + sanitizeReportUrl(url),
    )
    .replace(/\/(?:sso|oidc|(?:api\/iam\/)?auth)\/wechat-qr\/[^\s"'<>]+/giu, sanitizeReportUrl)
    .replace(/\b(Bearer|Basic)\s+[a-z\d+/=_~.-]+/giu, `$1 ${redacted}`)
    .replace(/\b(?:us|cs)_[A-Za-z\d_-]+/gu, redacted)
    .replace(/\beyJ[A-Za-z\d_-]+\.[A-Za-z\d_-]+\.[A-Za-z\d_-]+\b/gu, redacted)
    .replace(labeledSecret, (_value, prefix, name) => `${prefix}${name}=${redacted}`)
    .slice(0, limit);
}
