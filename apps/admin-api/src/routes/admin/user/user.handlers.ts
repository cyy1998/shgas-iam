import type { Context } from "hono";
import type { UserRouteHandler } from "./user.type";
import { defineAdminApiMutationOperation, defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import * as auditService from "@admin-api/services/audit/audit.service";
import {
  UserAdminCreateDtoSchema,
  UserPaginationQueryDtoSchema,
  UserUpdateDtoSchema,
} from "@admin-api/services/user/user.schema";
import * as userService from "@admin-api/services/user/user.service";
import { router } from "@iam/api-core/trpc";
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

const searchUser = defineAdminApiQueryOperation({
  input: UserPaginationQueryDtoSchema,
  restInput: c => c.req.valid("json") as z.infer<typeof UserPaginationQueryDtoSchema>,
  handler: async (input) => {
    const { result, ...rest } = await userService.searchUsersFuzzyForAdmin(input);
    return {
      result: result.map(u => toUserVo(u)),
      ...rest,
    };
  },
});

const getUser = defineAdminApiQueryOperation({
  input: z.object({ username: z.string() }),
  restInput: c => c.req.valid("param") as { username: string },
  handler: async ({ username }) => {
    const detail = await userService.getUserDetailByUsernameForAdmin(username);
    return toUserDetailVo(detail);
  },
});

const createUser = defineAdminApiMutationOperation({
  input: UserAdminCreateDtoSchema,
  restInput: c => c.req.valid("json") as z.infer<typeof UserAdminCreateDtoSchema>,
  handler: (input, context) => userService.setUserForAdmin(input, resolveAuditContext(context)),
});

const updateUser = defineAdminApiMutationOperation({
  input: z.object({
    username: z.string(),
    data: UserUpdateDtoSchema,
  }),
  restInput: c => ({
    username: (c.req.valid("param") as { username: string }).username,
    data: c.req.valid("json") as z.infer<typeof UserUpdateDtoSchema>,
  }),
  handler: ({ username, data }, context) => userService.updateUser(username, data, resolveAuditContext(context)),
});

const updateUserStatus = defineAdminApiMutationOperation({
  input: z.object({
    username: z.string(),
    status: z.enum(UserStatus),
  }),
  restInput: c => ({
    username: (c.req.valid("param") as { username: string }).username,
    status: (c.req.valid("json") as { status: UserStatus }).status,
  }),
  handler: ({ username, status }, context) =>
    userService.updateUserStatus(username, status, resolveAuditContext(context)),
});

const deleteUser = defineAdminApiMutationOperation({
  input: z.object({ username: z.string() }),
  restInput: c => c.req.valid("param") as { username: string },
  handler: ({ username }, context) => userService.deleteUser(username, resolveAuditContext(context)),
});

const resetPassword = defineAdminApiMutationOperation({
  input: z.object({ username: z.string() }),
  restInput: c => c.req.valid("param") as { username: string },
  handler: ({ username }, context) => userService.resetPasswordByUsername(username, resolveAuditContext(context)),
});

const generatePassword = defineAdminApiQueryOperation({
  input: z.object({}).optional(),
  restInput: () => undefined,
  handler: () => generateRandomPassword(8),
});

export const usersSearch = searchUser.toHandler<UserRouteHandler<"usersSearch">>();
export const usersDetail = getUser.toHandler<UserRouteHandler<"usersDetail">>();
export const usersCreate = createUser.toHandler<UserRouteHandler<"usersCreate">>();
export const usersUpdate = updateUser.toHandler<UserRouteHandler<"usersUpdate">>();
export const usersStatusUpdate = updateUserStatus.toHandler<UserRouteHandler<"usersStatusUpdate">>();
export const usersDelete = deleteUser.toHandler<UserRouteHandler<"usersDelete">>();
export const usersResetPassword = resetPassword.toHandler<UserRouteHandler<"usersResetPassword">>();
export const usersGeneratePassword = generatePassword.toHandler<UserRouteHandler<"usersGeneratePassword">>();

export const userAdminRouter = router({
  search: searchUser.toTRPC(),
  detail: getUser.toTRPC(),
  create: createUser.toTRPC(),
  update: updateUser.toTRPC(),
  updateStatus: updateUserStatus.toTRPC(),
  delete: deleteUser.toTRPC(),
  resetPassword: resetPassword.toTRPC(),
  generatePassword: generatePassword.toTRPC(),
});
