import type { createSubjectAccessOperations } from "@iam/api-core/subject-access";
import type { UnifiedCustomSsoOperations } from "@iam/custom-sso";
import type { Handler } from "hono";
import { mapCustomSsoRetryableError } from "@api/middlewares/custom-sso-retryable.error";
import { getApiAuditRequestContext } from "@api/services/audit/audit.context";
import * as resp from "@iam/api-core/http";
import { CustomSsoExchangeFailure } from "@iam/custom-sso";
import { parseBasicClientCredentials } from "./sso.handlers";
import { SsoTokenResultSchema } from "./sso.schema";

export function createUnifiedTokenHandler(deps: { custom: { forOperation: (operation: Parameters<UnifiedCustomSsoOperations["forOperation"]>[0]) => Pick<ReturnType<UnifiedCustomSsoOperations["forOperation"]>, "exchange"> }; operations: ReturnType<typeof createSubjectAccessOperations>; retryAfterSeconds: number }): Handler {
  return async (c) => {
    const credentials = parseBasicClientCredentials(c.req.header("Authorization"));
    // Parsing retains the bounded locator even when other parameters are invalid.
    const body = await c.req.text();
    const form = new URLSearchParams(body);
    const code = form.get("code") ?? "";
    const invalidParameters = new URL(c.req.url).search !== ""
      || c.req.header("Content-Type")?.split(";")[0] !== "application/x-www-form-urlencoded"
      || form.getAll("code").length !== 1 || form.getAll("redirect_uri").length !== 1
      || [...form.keys()].some(key => key !== "code" && key !== "redirect_uri");
    try {
      const response = await deps.operations.run(operation => deps.custom.forOperation(operation).exchange({ ...credentials, code, redirectUri: form.get("redirect_uri"), requestContext: getApiAuditRequestContext(c), invalidParameters }, result => c.json(resp.ok(SsoTokenResultSchema.parse(result)), 200)));
      if (!(response instanceof Response))
        throw new Error("Custom SSO delivery did not produce a response");
      return response;
    }
    catch (error) {
      if (error instanceof CustomSsoExchangeFailure) {
        c.header("X-IAM-Code-Consumption", error.consumption);
        c.header("X-IAM-Client-Session-Revocation", error.revocation.status);
        c.header("X-IAM-Token-Compensation", error.tokenCompensation);
        throw mapCustomSsoRetryableError(error.failure, { retryAfterSeconds: deps.retryAfterSeconds });
      }
      throw mapCustomSsoRetryableError(error, { retryAfterSeconds: deps.retryAfterSeconds });
    }
  };
}
