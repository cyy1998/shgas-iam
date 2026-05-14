import redis from "@api/lib/clients/redis";
import * as clientService from "@api/services/client/client.service";
import { UserDetailDtoSchema } from "@api/services/user/user.schema";
import {
  createInternalAuthenticationHandler,
  createPublicAuthenticationHandler,
} from "@iam/api-core/middlewares";

export const publicAuthenticationHandler = createPublicAuthenticationHandler({
  redis,
  userSchema: UserDetailDtoSchema,
});

export const internalAuthenticationHandler = createInternalAuthenticationHandler({
  getClientBySecret: clientService.getClientBySecret,
});
