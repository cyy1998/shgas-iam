import type { Context, Next } from "hono";
import type { Logger } from "pino";
import type { InternalBindings } from "../types/lib";
import { ClientStatus } from "@iam/contracts";
import { getContextValue, getRequestId } from "../core/request-context";
import { AuthzUnauthorizedError } from "../errors/AuthzUnauthorizedError";

export type InternalClientIdentity = {
  clientCode: string;
  isDelete: boolean;
  status: ClientStatus;
};

export type InternalAuthOptions<TClient extends InternalClientIdentity> = {
  getClientBySecret: (secret: string) => Promise<TClient | null>;
};

type InternalAuthLogger = Pick<Logger, "warn">;

function getInternalAuthLogger(c: Context): InternalAuthLogger | undefined {
  const logger = getContextValue<InternalAuthLogger>(c, "logger");
  return typeof logger?.warn === "function" ? logger : undefined;
}

function warnInternalAuthFailure(
  c: Context,
  reason: string,
  metadata: { clientCode?: string; isDelete?: boolean; status?: ClientStatus } = {},
) {
  getInternalAuthLogger(c)?.warn({
    reason,
    requestId: getRequestId(c),
    ...metadata,
  }, "internal client authentication failed");
}

export async function verifyInternalClient<TClient extends InternalClientIdentity>(
  c: Context,
  options: InternalAuthOptions<TClient>,
): Promise<TClient> {
  const clientSecret = c.req.header("apikey");
  if (!clientSecret) {
    warnInternalAuthFailure(c, "missing_apikey");
    throw new AuthzUnauthorizedError("非法访问");
  }

  const clientDto = await options.getClientBySecret(clientSecret);
  if (!clientDto) {
    warnInternalAuthFailure(c, "secret_not_found");
    throw new AuthzUnauthorizedError("无效secret");
  }

  if (clientDto.isDelete || clientDto.status !== ClientStatus.Enable) {
    warnInternalAuthFailure(c, "inactive_client", {
      clientCode: clientDto.clientCode,
      isDelete: clientDto.isDelete,
      status: clientDto.status,
    });
    throw new AuthzUnauthorizedError("无效secret");
  }

  return clientDto;
}

export function createInternalAuthenticationHandler<TClient extends InternalClientIdentity>(
  options: InternalAuthOptions<TClient>,
) {
  return async (c: Context<InternalBindings<TClient>>, next: Next) => {
    const clientDto = await verifyInternalClient(c, options);
    c.set("clientCode", clientDto.clientCode);
    c.set("clientDto", clientDto);
    return await next();
  };
}
