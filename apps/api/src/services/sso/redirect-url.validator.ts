import type { LoggerPort } from "@api/composition/runtime";
import type { AuditRequestContext } from "@iam/domain/audit";
import { SystemLogEvent } from "@iam/api-core/logger";
import { observabilityLogFields } from "@iam/api-core/observability";
import { matchRedirectUrlPattern } from "@iam/domain/client";

export interface SsoRedirectUrlValidatorDeps {
  logger: Pick<LoggerPort, "warn">;
}

export interface SsoRedirectValidationOptions {
  requestContext?: AuditRequestContext;
}

function hasSupportedRedirectUrlSyntax(redirectUrl: string) {
  try {
    const url = new URL(redirectUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  }
  catch {
    return false;
  }
}

export function createSsoRedirectUrlValidator(deps: SsoRedirectUrlValidatorDeps) {
  function isAllowed(
    clientCode: string,
    redirectUrl: string,
    patterns: string[],
    options: SsoRedirectValidationOptions = {},
  ) {
    if (!hasSupportedRedirectUrlSyntax(redirectUrl)) {
      return false;
    }

    for (const pattern of patterns) {
      try {
        if (matchRedirectUrlPattern(redirectUrl, pattern)) {
          return true;
        }
      }
      catch (err) {
        deps.logger.warn({
          event: SystemLogEvent.RedirectPatternInvalid,
          err,
          clientCode,
          pattern,
          ...observabilityLogFields(options.requestContext),
        }, "invalid client redirect url pattern");
      }
    }

    return false;
  }

  return { isAllowed };
}

export type SsoRedirectUrlValidator = ReturnType<typeof createSsoRedirectUrlValidator>;
