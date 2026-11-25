const retiredQrRoutes = ["/oidc/wechat-qr", "/sso/wechat-qr"];

export function redactRetiredLoginPath(path: string) {
  const route = retiredQrRoutes.find((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  return route && `${route}/*`;
}
