import type { RedisPort } from "@api/composition/runtime";
import type { ClientService } from "@api/services/client/client.service";
import { UserDetailDtoSchema } from "@api/services/user/user.schema";
import {
  createInternalAuthenticationHandler,
  createPublicAuthenticationHandler,
} from "@iam/api-core/middlewares";

export interface CreateApiAuthenticationHandlersDeps {
  clientService: Pick<ClientService, "getClientBySecret">;
  redis: RedisPort;
}

export function createApiAuthenticationHandlers(deps: CreateApiAuthenticationHandlersDeps) {
  return {
    publicAuthenticationHandler: createPublicAuthenticationHandler({
      redis: deps.redis,
      userSchema: UserDetailDtoSchema,
    }),
    internalAuthenticationHandler: createInternalAuthenticationHandler({
      getClientBySecret: deps.clientService.getClientBySecret,
    }),
  };
}

export type ApiAuthenticationHandlers = ReturnType<typeof createApiAuthenticationHandlers>;
