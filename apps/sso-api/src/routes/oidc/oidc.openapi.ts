import { createRoute, type RouteConfig, z } from "@hono/zod-openapi";
import type { createRouter } from "@iam/api-core/core/create-router";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import { OidcErrorSchema, OidcLoginGuardSchema, OidcTokenResponseSchema } from "@iam/oidc/wire";

export function documentOidcRoutes(router: ReturnType<typeof createRouter>, hasTokens: boolean) {
  const trustedEntry = z.object({
    "X-IAM-Entry-Network": z.enum(["internal", "external"]).describe("可信网关注入的入口标签"),
  });
  const protocolError = jsonContent(OidcErrorSchema, "OIDC 协议拒绝");
  const unavailable = jsonContent(OidcErrorSchema, "协议依赖暂不可用");
  const routes: Array<Pick<RouteConfig, "method" | "path" | "responses">> = [
    {
      method: "get",
      path: "/.well-known/openid-configuration",
      responses: { 200: { description: "所选 issuer 的发现文档" } },
    },
    ...(["get", "post"] as const).map((method) => ({
      method,
      path: "/auth",
      responses: {
        200: { description: "form_post 授权响应" },
        302: { description: "进入 IAM 登录" },
        303: { description: "返回已登记的应用地址" },
      },
    })),
    { method: "get", path: "/login-guard", responses: { 200: jsonContent(OidcLoginGuardSchema, "认证续接状态") } },
    { method: "get", path: "/resume", responses: { 303: { description: "认证后返回应用" } } },
    ...(["get", "post"] as const).map((method) => ({
      method,
      path: "/session/end",
      responses: { 200: { description: "退出确认页" }, 303: { description: "退出后的重定向" } },
    })),
    { method: "post", path: "/session/end/confirm", responses: { 303: { description: "退出确认后的重定向" } } },
    { method: "get", path: "/session/end/success", responses: { 200: { description: "退出完成页" } } },
    ...(hasTokens
      ? ([
          { method: "get", path: "/jwks", responses: { 200: { description: "当前和上一代公开签名验证密钥" } } },
          {
            method: "post",
            path: "/token",
            responses: {
              200: jsonContent(OidcTokenResponseSchema, "授权码兑换结果"),
              401: protocolError,
            },
          },
          ...(["get", "post"] as const).map((method) => ({
            method,
            path: "/me",
            responses: { 200: { description: "当前许可范围的主体资料" }, 401: protocolError },
          })),
        ] as const)
      : []),
  ];
  // Document the wire without moving validation ahead of protocol authentication or Code location.
  for (const { method, path, responses } of routes) {
    router.openAPIRegistry.registerPath(
      createRoute({
        method,
        path,
        tags: ["OIDC"],
        request: { headers: trustedEntry },
        responses: { ...responses, 400: protocolError, 503: unavailable },
      }),
    );
  }
}
