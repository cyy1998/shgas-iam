import type { createSubjectAccessOperations } from "@iam/api-core/subject-access";
import type { UnifiedCustomSsoOperations } from "@iam/custom-sso";
import type { SsoRouteHandler } from "./sso.type";
import { mapCustomSsoRetryableError } from "@api/middlewares/custom-sso-retryable.error";
import { getApiAuditRequestContext } from "@api/services/audit/audit.context";
import { customSsoLocalSessionCookieName } from "@api/services/sso/transport/custom-sso-client-code.transport";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { createSubjectAccessHttpAdapter } from "@iam/api-core/subject-access";
import { CustomSsoManagedFailure } from "@iam/custom-sso";
import { serialize } from "hono/utils/cookie";

const subjectAccessHttp = createSubjectAccessHttpAdapter();

export function createUnifiedCallbackHandler(deps: {
  custom: {
    forOperation: (
      operation: Parameters<UnifiedCustomSsoOperations["forOperation"]>[0],
    ) => Pick<ReturnType<UnifiedCustomSsoOperations["forOperation"]>, "completeCallback">;
  };
  operations: ReturnType<typeof createSubjectAccessOperations>;
  retryAfterSeconds: number;
}): SsoRouteHandler<"callback"> {
  return async (c) => {
    const { code, client, redirectUrl } = c.req.valid("query");
    const cookieName = customSsoLocalSessionCookieName(client);
    return await subjectAccessHttp.run(
      c,
      { clearCookiesOnInvalidSession: ["global_session", cookieName, "orcas_sso_sessionid"] },
      async () => {
        try {
          const response = await deps.operations.run(operation =>
            deps.custom
              .forOperation(operation)
              .completeCallback(
                { code, clientCode: client, redirectUrl, requestContext: getApiAuditRequestContext(c) },
                (result) => {
                  const url = new URL(result.redirectUrl);
                  url.searchParams.set("token", result.token);
                  if (result.state !== undefined)
                    url.searchParams.set("state", result.state);
                  const headers = new Headers();
                  const cookie = { httpOnly: true, sameSite: "Lax" as const, maxAge: result.ttl, path: "/" };
                  headers.append("Set-Cookie", serialize(cookieName, result.token, cookie));
                  if (result.orcasSessionId !== null) {
                    headers.append(
                      "Set-Cookie",
                      serialize("orcas_sso_sessionid", result.orcasSessionId, cookie),
                    );
                    url.searchParams.set("orcasToken", result.orcasSessionId);
                  }
                  headers.set("Location", url.href);
                  return new Response(null, { status: HttpStatusCodes.MOVED_TEMPORARILY, headers });
                },
              ),
          );
          if (!(response instanceof Response))
            throw new Error("Managed Custom SSO delivery did not produce a response");
          return response;
        }
        catch (error) {
          if (error instanceof CustomSsoManagedFailure) {
            c.header("X-IAM-Code-Consumption", error.consumption);
            c.header("X-IAM-Token-Compensation", error.tokenCompensation);
            throw mapCustomSsoRetryableError(error.failure, { retryAfterSeconds: deps.retryAfterSeconds });
          }
          throw mapCustomSsoRetryableError(error, { retryAfterSeconds: deps.retryAfterSeconds });
        }
      },
    );
  };
}
