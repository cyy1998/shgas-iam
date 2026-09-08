import type { AuditRequestContext } from "@iam/domain/audit";
import type { CustomSsoLoggerPort as LoggerPort } from "../custom-sso.port";
import { SystemLogEvent } from "@iam/api-core/logger";
import { observabilityLogFields } from "@iam/api-core/observability";
import {
  matchRedirectUrlPattern,
  normalizeRedirectUrl,
  RedirectUrlPatternFailureReasons,
  RedirectUrlPatternSyntaxError,
} from "@iam/domain/client";

export interface SsoRedirectUrlValidatorDeps {
  logger: Pick<LoggerPort, "warn">;
}

export interface SsoRedirectValidationOptions {
  requestContext?: AuditRequestContext;
}

export function createSsoRedirectUrlValidator(deps: SsoRedirectUrlValidatorDeps) {
  function normalizeAllowed(
    clientCode: string,
    redirectUrl: string,
    patterns: string[],
    options: SsoRedirectValidationOptions = {},
  ) {
    let normalizedRedirectUrl: string;
    try {
      normalizedRedirectUrl = normalizeRedirectUrl(redirectUrl);
    }
    catch {
      return null;
    }

    for (const [patternIndex, pattern] of patterns.entries()) {
      try {
        if (matchRedirectUrlPattern(normalizedRedirectUrl, pattern)) {
          return normalizedRedirectUrl;
        }
      }
      catch (error) {
        deps.logger.warn({
          event: SystemLogEvent.RedirectPatternInvalid,
          clientCode,
          patternIndex,
          reason: error instanceof RedirectUrlPatternSyntaxError
            ? error.reason
            : RedirectUrlPatternFailureReasons.InvalidUrl,
          ...observabilityLogFields(options.requestContext),
        }, "invalid client redirect url pattern");
      }
    }

    return null;
  }

  return { normalizeAllowed };
}

export type SsoRedirectUrlValidator = ReturnType<typeof createSsoRedirectUrlValidator>;
