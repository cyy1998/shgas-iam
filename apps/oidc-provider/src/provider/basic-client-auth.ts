export function parseBasicClientId(authorization: string | undefined) {
  if (!authorization?.startsWith("Basic "))
    return null;
  try {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    return separator > 0 ? decodeURIComponent(decoded.slice(0, separator)) : null;
  }
  catch {
    return null;
  }
}
