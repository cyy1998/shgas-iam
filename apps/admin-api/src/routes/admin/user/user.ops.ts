import type { Context } from "hono";
import * as auditService from "@admin-api/services/audit/audit.service";
import {
  UserAdminCreateDtoSchema,
  UserPaginationQueryDtoSchema,
  UserUpdateDtoSchema,
} from "@admin-api/services/user/user.schema";
import * as userService from "@admin-api/services/user/user.service";
import { defineMutationOp, defineQueryOp } from "@iam/api-core/core/business-op";
import { generateRandomPassword } from "@iam/api-core/utils";
import { UserStatus } from "@iam/contracts";
import { z } from "zod";
import { toUserDetailVo, toUserVo } from "./user.schema";

function resolveAuditContext(context?: unknown) {
  const hono = (context as { hono?: Context } | undefined)?.hono;
  if (!hono) {
    return undefined;
  }
  return {
    ...auditService.getAdminAuditActor(hono),
    ...auditService.getAdminAuditRequestContext(hono),
  };
}

export const searchUserOp = defineQueryOp({
  input: UserPaginationQueryDtoSchema,
  handler: async (input) => {
    const { result, ...rest } = await userService.searchUsersFuzzyForAdmin(input);
    return {
      result: result.map(u => toUserVo(u)),
      ...rest,
    };
  },
});

export const getUserOp = defineQueryOp({
  input: z.object({ username: z.string() }),
  handler: async ({ username }) => {
    const detail = await userService.getUserDetailByUsernameForAdmin(username);
    return toUserDetailVo(detail);
  },
});

export const createUserOp = defineMutationOp({
  input: UserAdminCreateDtoSchema,
  handler: (input, context) => userService.setUserForAdmin(input, resolveAuditContext(context)),
});

export const updateUserOp = defineMutationOp({
  input: z.object({
    username: z.string(),
    data: UserUpdateDtoSchema,
  }),
  handler: ({ username, data }, context) => userService.updateUser(username, data, resolveAuditContext(context)),
});

export const updateUserStatusOp = defineMutationOp({
  input: z.object({
    username: z.string(),
    status: z.enum(UserStatus),
  }),
  handler: ({ username, status }, context) =>
    userService.updateUserStatus(username, status, resolveAuditContext(context)),
});

export const deleteUserOp = defineMutationOp({
  input: z.object({ username: z.string() }),
  handler: ({ username }, context) => userService.deleteUser(username, resolveAuditContext(context)),
});

export const resetPasswordOp = defineMutationOp({
  input: z.object({ username: z.string() }),
  handler: ({ username }, context) => userService.resetPasswordByUsername(username, resolveAuditContext(context)),
});

export const generatePasswordOp = defineQueryOp({
  input: z.object({}).optional(),
  handler: () => Promise.resolve(generateRandomPassword(8)),
});
