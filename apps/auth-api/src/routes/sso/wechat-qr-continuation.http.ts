import type { PrepareWechatQrContinuation } from "@auth-api/use-cases/authentication/wechat-qr/wechat-qr-completion.use-case";
import { z } from "@hono/zod-openapi";
import { mapCustomSsoRetryableError } from "@iam/api-core/http/custom-sso-retryable";
import { ClientSnapshotUnavailableError } from "@iam/client-snapshot";
import { ApiErrorCode, ClientCodeSchema } from "@iam/contracts";
import { SERVICE_UNAVAILABLE } from "@iam/contracts/http";
import type { createCustomSsoWechatQrContinuation } from "@iam/custom-sso/wechat-qr";
import { type createOidcWechatQrContinuation, OidcProtocolError, OidcStateUnavailableError } from "@iam/oidc/wechat-qr";
import { BadRequestError, CustomError } from "@iam/runtime/errors";
import { SessionStorageError } from "@iam/session-kernel";
import type { createSubjectAccessOperations } from "@iam/subject-access";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";

const handle = z.string().regex(/^[\w-]{43}$/u);
const forbiddenHandle = z.never().openapi({ type: "string", not: {} }).optional();
export const WechatQrContinuationQuery = z.discriminatedUnion("protocol", [
  z.object({ protocol: z.literal("oidc"), oidcReturn: handle, ssoReturn: forbiddenHandle }),
  z.object({
    protocol: z.literal("custom_sso"),
    ssoReturn: handle,
    oidcReturn: forbiddenHandle,
    client: ClientCodeSchema,
    redirectUrl: z.url(),
    state: z.string().optional(),
  }),
]);

function readContinuation(c: Context) {
  const query = c.req.queries();
  if (
    ["protocol", "oidcReturn", "ssoReturn", "client", "redirectUrl", "state"].some(
      (key) => (query[key]?.length ?? 0) > 1,
    )
  ) {
    throw new BadRequestError("登录请求无效");
  }
  const result = WechatQrContinuationQuery.safeParse(c.req.query());
  if (!result.success) throw new BadRequestError("登录请求无效");
  return result.data;
}

function requireBinding(c: Context, name: string) {
  const browserBinding = getCookie(c, name);
  if (!browserBinding) throw new BadRequestError("登录请求无效");
  return browserBinding;
}

export function createWechatQrContinuationHttp(deps: {
  customSso: ReturnType<typeof createCustomSsoWechatQrContinuation>;
  oidc: ReturnType<typeof createOidcWechatQrContinuation>;
  operations: ReturnType<typeof createSubjectAccessOperations>;
  internalIssuer: string;
  retryAfterSeconds: number;
}) {
  function mapError(c: Context, error: unknown) {
    if (error instanceof OidcProtocolError && error.status !== SERVICE_UNAVAILABLE)
      return new BadRequestError("登录请求无效或已失效");
    if (
      error instanceof OidcProtocolError ||
      error instanceof OidcStateUnavailableError ||
      error instanceof SessionStorageError ||
      error instanceof ClientSnapshotUnavailableError
    ) {
      c.header("Retry-After", String(deps.retryAfterSeconds));
      return new CustomError("登录服务暂时不可用", {
        code: ApiErrorCode.InternalError,
        httpStatus: SERVICE_UNAVAILABLE,
      });
    }
    return mapCustomSsoRetryableError(error, { retryAfterSeconds: deps.retryAfterSeconds });
  }

  return {
    async inspect(c: Context) {
      const query = readContinuation(c);
      const globalSessionToken = getCookie(c, "global_session");
      try {
        if (query.protocol === "oidc") {
          const browserBinding = requireBinding(c, "oidc_interaction_binding");
          const continuation = await deps.operations.run((operation) =>
            deps.oidc.forOperation(operation, deps.internalIssuer).inspectLoginContinuation(query.oidcReturn, {
              browserBinding,
              globalSessionToken,
            }),
          );
          return {
            ...continuation,
            browser: { protocol: query.protocol, continuation: query.oidcReturn, browserBinding },
          };
        }
        const browserBinding = requireBinding(c, "custom_sso_continuation");
        const continuation = await deps.operations.run((operation) =>
          deps.customSso.forOperation(operation).inspectLoginContinuation({
            clientCode: query.client,
            redirectUrl: query.redirectUrl,
            state: query.state,
            continuation: query.ssoReturn,
            browserBinding,
            globalSessionToken,
          }),
        );
        return {
          ...continuation,
          browser: { protocol: query.protocol, continuation: query.ssoReturn, browserBinding },
        };
      } catch (error) {
        throw mapError(c, error);
      }
    },
    async prepareContinuation(c: Context, root: Parameters<PrepareWechatQrContinuation>[0]) {
      const query = readContinuation(c);
      if (query.protocol === "custom_sso") return;
      try {
        const browserBinding = requireBinding(c, "oidc_interaction_binding");
        await deps.operations.run((operation) =>
          deps.oidc
            .forOperation(operation, deps.internalIssuer)
            .prepareWechatQrCompletion(query.oidcReturn, browserBinding, root),
        );
      } catch (error) {
        throw mapError(c, error);
      }
    },
  };
}
