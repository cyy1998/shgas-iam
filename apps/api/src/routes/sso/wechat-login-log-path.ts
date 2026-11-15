const customPath = "/sso/wechat-qr";
const oidcPath = "/oidc/wechat-qr";
const mobilePath = `${customPath}/mobile`;
const legacyPath = "/sso/third-party/wx";

export function getWechatLoginLogPath(path: string): string | undefined {
  if (path === legacyPath || path === `${legacyPath}/`) return legacyPath;
  const base = [customPath, oidcPath].find((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  if (!base) return undefined;
  if (path === base || path === `${base}/`) return base;
  const matchedPath = path.endsWith("/") ? path.slice(0, -1) : path;
  if (matchedPath.startsWith(`${mobilePath}/`)) {
    const suffix = matchedPath.slice(mobilePath.length + 1);
    if (suffix === "callback" || suffix === "decision") return `${mobilePath}/${suffix}`;
    if (/^confirm\/[^/]+$/u.test(suffix)) return `${mobilePath}/confirm/:flowId`;
    if (/^[^/]+$/u.test(suffix)) return `${mobilePath}/:requestId`;
  }
  const route = /^\/[^/]+\/(events|complete|bind\/(?:password|sms(?:\/send)?))$/u.exec(matchedPath.slice(base.length));
  return route ? `${base}/:requestId/${route[1]}` : `${base}/*`;
}
