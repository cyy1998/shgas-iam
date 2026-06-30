import type { errors, KoaContextWithOIDC } from "oidc-provider";
import type Provider from "oidc-provider";
import type { OidcLogger } from "../lib/logger.ts";
import { LoggerSourceApp, SystemLogEvent } from "@iam/api-core/logger";

export function registerProviderEvents(provider: Provider, logger: OidcLogger) {
  provider.on("server_error", (ctx, error) => {
    logger.error({
      event: SystemLogEvent.OidcProviderServerError,
      sourceApp: LoggerSourceApp.OidcProvider,
      err: error,
      requestId: ctx.state.requestId,
      traceId: ctx.state.traceId ?? null,
      errorName: error.name,
      errorMessage: error.message,
    }, "OIDC provider server error");
  });
  const logProtocolError = (event: string) => (ctx: KoaContextWithOIDC, error: errors.OIDCProviderError) => {
    logger.warn({
      event: SystemLogEvent.OidcProviderProtocolError,
      sourceApp: LoggerSourceApp.OidcProvider,
      oidcEvent: event,
      errorCode: error.error,
      errorName: error.name,
      errorMessage: error.message,
      requestId: ctx.state.requestId,
      traceId: ctx.state.traceId ?? null,
      statusCode: error.statusCode,
    }, `OIDC ${event}`);
  };
  provider.on("authorization.error", logProtocolError("authorization.error"));
  provider.on("grant.error", logProtocolError("grant.error"));
  provider.on("userinfo.error", logProtocolError("userinfo.error"));
  provider.on("end_session.error", logProtocolError("end_session.error"));
}
