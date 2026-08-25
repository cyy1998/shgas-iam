import type { RandomPort } from "@admin-api/composition/runtime";
import type { UserService } from "@admin-api/services/user/user.service";
import type { Context } from "hono";
import type { UserRouteHandler } from "./user.type";
import { defineAdminApiMutationOperation, defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import {
  authorizeAdminOperationForContext,
  getAdminAuthorizationContext,
  resolveAdminUserAuthorizationForContext,
} from "@admin-api/services/admin-authorization/admin-authorization.context";
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
import { EmploymentStatus, UserStatus } from "@iam/contracts";
import { OPEN_EMPLOYMENT_STATUSES } from "@iam/domain/employment";
import { z } from "zod";
import { toUserDetailVo, toUserVo } from "./user.schema";

const openEmploymentStatuses: readonly EmploymentStatus[] = OPEN_EMPLOYMENT_STATUSES;

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
    operationId: "admin.user.search",
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
    operationId: "admin.user.detail",
    input: z.object({ username: z.string() }),
    restInput: c => c.req.valid("param") as { username: string },
    handler: async ({ username }, context) => {
      const detail = await deps.userService.getUserDetailByUsernameForAdmin(username);
      const { actor, policy } = getAdminAuthorizationContext(context.hono);
      const operationAuthorization = await authorizeAdminOperationForContext(
        context.hono,
        {
          operationId: "admin.user.detail",
          operationInput: { username },
        },
      );
      const [userAuthorization, employmentAuthorization] = await Promise.all([
        policy.getUserAuthorization(
          actor,
          operationAuthorization.hrAdministrationScope,
        ),
        policy.getEmploymentAuthorization(
          actor,
          operationAuthorization.hrAdministrationScope,
        ),
      ]);
      const allowedActions = userAuthorization.getAllowedActions({
        status: detail.status,
        isDelete: detail.isDelete,
        openEmploymentOrganizationIds: detail.employments
          .filter(employment => !employment.isDelete
            && openEmploymentStatuses.includes(employment.status))
          .map(employment => employment.orgId),
        endedEmploymentOrganizationIds: detail.employments
          .filter(employment => !employment.isDelete
            && employment.status === EmploymentStatus.Disable)
          .map(employment => employment.orgId),
      });
      return toUserDetailVo(detail, allowedActions, employmentAuthorization);
    },
  });

  const createUser = defineAdminApiMutationOperation({
    operationId: "admin.user.create",
    input: UserAdminCreateDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof UserAdminCreateDtoSchema>,
    handler: (input, context) => deps.userService.setUserForAdmin(input, resolveAuditContext(context)),
  });

  const updateUser = defineAdminApiMutationOperation({
    operationId: "admin.user.update",
    input: z.object({
      username: z.string(),
      data: UserUpdateDtoSchema,
    }),
    restInput: c => ({
      username: (c.req.valid("param") as { username: string }).username,
      data: c.req.valid("json") as z.infer<typeof UserUpdateDtoSchema>,
    }),
    handler: async ({ username, data }, context) => deps.userService.updateUser(
      username,
      data,
      resolveAuditContext(context),
      await resolveAdminUserAuthorizationForContext(
        context.hono,
        "admin.user.update",
      ),
    ),
  });

  const updateUserStatus = defineAdminApiMutationOperation({
    operationId: "admin.user.updateStatus",
    input: z.object({
      username: z.string(),
      status: z.enum(UserStatus),
    }),
    restInput: c => ({
      username: (c.req.valid("param") as { username: string }).username,
      status: (c.req.valid("json") as { status: UserStatus }).status,
    }),
    handler: async ({ username, status }, context) =>
      deps.userService.updateUserStatus(
        username,
        status,
        resolveAuditContext(context),
        await resolveAdminUserAuthorizationForContext(
          context.hono,
          "admin.user.updateStatus",
        ),
      ),
  });

  const deleteUser = defineAdminApiMutationOperation({
    operationId: "admin.user.delete",
    input: z.object({ username: z.string() }),
    restInput: c => c.req.valid("param") as { username: string },
    handler: ({ username }, context) => deps.userService.deleteUser(username, resolveAuditContext(context)),
  });

  const resetPassword = defineAdminApiMutationOperation({
    operationId: "admin.user.resetPassword",
    input: z.object({ username: z.string() }),
    restInput: c => c.req.valid("param") as { username: string },
    handler: async ({ username }, context) => deps.userService.resetPasswordByUsername(
      username,
      resolveAuditContext(context),
      await resolveAdminUserAuthorizationForContext(
        context.hono,
        "admin.user.resetPassword",
      ),
    ),
  });

  const generatePassword = defineAdminApiQueryOperation({
    operationId: "admin.user.generatePassword",
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
