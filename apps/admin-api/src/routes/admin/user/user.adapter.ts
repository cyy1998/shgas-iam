import type { RandomPort } from "@admin-api/composition/runtime";
import type { UserService } from "@admin-api/services/user/user.service";
import type { Context } from "hono";
import type { UserRouteHandler } from "./user.type";
import { defineAdminApiMutationOperation, defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import {
  getAdminAuditActor,
  getAdminAuditRequestContext,
} from "@admin-api/services/audit/audit.context";
import {
  UserAdminCreateDtoSchema,
  UserPaginationQueryDtoSchema,
  UserUpdateDtoSchema,
} from "@admin-api/services/user/user.schema";
import { router } from "@iam/api-core/trpc";
import { UserStatus } from "@iam/contracts";
import { z } from "zod";
import { toUserDetailVo, toUserVo } from "./user.schema";

export interface CreateUserAdapterDeps {
  random: Pick<RandomPort, "password">;
  userService: Pick<
    UserService,
    | "deleteUser"
    | "getUserDetailByUsernameForAdmin"
    | "resetPasswordByUsername"
    | "searchUsersFuzzyForAdmin"
    | "setUserForAdmin"
    | "updateUser"
    | "updateUserStatus"
  >;
}

function resolveAuditContext(context?: unknown) {
  const hono = (context as { hono?: Context } | undefined)?.hono;
  if (!hono) {
    return undefined;
  }
  return {
    ...getAdminAuditActor(hono),
    ...getAdminAuditRequestContext(hono),
  };
}

export function createUserAdapter(deps: CreateUserAdapterDeps) {
  const searchUser = defineAdminApiQueryOperation({
    input: UserPaginationQueryDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof UserPaginationQueryDtoSchema>,
    handler: async (input) => {
      const { result, ...rest } = await deps.userService.searchUsersFuzzyForAdmin(input);
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
      const detail = await deps.userService.getUserDetailByUsernameForAdmin(username);
      return toUserDetailVo(detail);
    },
  });

  const createUser = defineAdminApiMutationOperation({
    input: UserAdminCreateDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof UserAdminCreateDtoSchema>,
    handler: (input, context) => deps.userService.setUserForAdmin(input, resolveAuditContext(context)),
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
    handler: ({ username, data }, context) => deps.userService.updateUser(username, data, resolveAuditContext(context)),
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
      deps.userService.updateUserStatus(username, status, resolveAuditContext(context)),
  });

  const deleteUser = defineAdminApiMutationOperation({
    input: z.object({ username: z.string() }),
    restInput: c => c.req.valid("param") as { username: string },
    handler: ({ username }, context) => deps.userService.deleteUser(username, resolveAuditContext(context)),
  });

  const resetPassword = defineAdminApiMutationOperation({
    input: z.object({ username: z.string() }),
    restInput: c => c.req.valid("param") as { username: string },
    handler: ({ username }, context) =>
      deps.userService.resetPasswordByUsername(username, resolveAuditContext(context)),
  });

  const generatePassword = defineAdminApiQueryOperation({
    input: z.object({}).optional(),
    restInput: () => undefined,
    handler: () => deps.random.password(8),
  });

  const userAdminRouter = router({
    search: searchUser.toTRPC(),
    detail: getUser.toTRPC(),
    create: createUser.toTRPC(),
    update: updateUser.toTRPC(),
    updateStatus: updateUserStatus.toTRPC(),
    delete: deleteUser.toTRPC(),
    resetPassword: resetPassword.toTRPC(),
    generatePassword: generatePassword.toTRPC(),
  });

  return {
    userAdminRouter,
    usersCreate: createUser.toHandler<UserRouteHandler<"usersCreate">>(),
    usersDelete: deleteUser.toHandler<UserRouteHandler<"usersDelete">>(),
    usersDetail: getUser.toHandler<UserRouteHandler<"usersDetail">>(),
    usersGeneratePassword: generatePassword.toHandler<UserRouteHandler<"usersGeneratePassword">>(),
    usersResetPassword: resetPassword.toHandler<UserRouteHandler<"usersResetPassword">>(),
    usersSearch: searchUser.toHandler<UserRouteHandler<"usersSearch">>(),
    usersStatusUpdate: updateUserStatus.toHandler<UserRouteHandler<"usersStatusUpdate">>(),
    usersUpdate: updateUser.toHandler<UserRouteHandler<"usersUpdate">>(),
  };
}

export type UserAdapter = ReturnType<typeof createUserAdapter>;
