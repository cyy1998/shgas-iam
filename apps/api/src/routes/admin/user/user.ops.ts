import { generateRandomPassword } from "@utils/encryption.utils";
import { z } from "zod";
import { Status } from "@/enums/status";
import { defineMutationOp, defineQueryOp } from "@/lib/core/business-op";
import {
  UserAdminCreateDtoSchema,
  UserPaginationQueryDtoSchema,
  UserUpdateDtoSchema,
} from "@/services/user/user.schema";
import * as userService from "@/services/user/user.service";
import { UserDetailVoConverterSchema, UserVoConverterSchema } from "./user.schema";

export const searchUserOp = defineQueryOp({
  input: UserPaginationQueryDtoSchema,
  handler: async (input) => {
    const { result, ...rest } = await userService.searchUsersFuzzyForAdmin(input);
    return {
      result: result.map(u => UserVoConverterSchema.parse(u)),
      ...rest,
    };
  },
});

export const getUserOp = defineQueryOp({
  input: z.object({ username: z.string() }),
  handler: async ({ username }) => {
    const detail = await userService.getUserDetailByUsernameForAdmin(username);
    return UserDetailVoConverterSchema.parse(detail);
  },
});

export const createUserOp = defineMutationOp({
  input: UserAdminCreateDtoSchema,
  handler: input => userService.setUserForAdmin(input),
});

export const updateUserOp = defineMutationOp({
  input: z.object({
    username: z.string(),
    data: UserUpdateDtoSchema,
  }),
  handler: ({ username, data }) => userService.updateUser(username, data),
});

export const updateUserStatusOp = defineMutationOp({
  input: z.object({
    username: z.string(),
    status: z.enum(Status),
  }),
  handler: ({ username, status }) => userService.updateUserStatus(username, status),
});

export const deleteUserOp = defineMutationOp({
  input: z.object({ username: z.string() }),
  handler: ({ username }) => userService.deleteUser(username),
});

export const resetPasswordOp = defineMutationOp({
  input: z.object({ username: z.string() }),
  handler: ({ username }) => userService.resetPasswordByUsername(username),
});

export const generatePasswordOp = defineQueryOp({
  input: z.object({}).optional(),
  handler: () => Promise.resolve(generateRandomPassword(8)),
});
