import type { UserRouteHandler } from "./user.type";
import { generateRandomPassword } from "@utils/encryption.utils";
import { hash } from "bcrypt-ts";
import { prisma } from "@/db";
import config from "@/env";
import { UserNotFoundError } from "@/errors/UserNotFoundError";
import * as userRepository from "@/services/user/user.repository";
import * as userService from "@/services/user/user.service";
import * as resp from "@/utils/http/response";
import { UserDetailVoConverterSchema, UserVoConverterSchema } from "./user.schema";

export const usersSearch: UserRouteHandler<"usersSearch"> = async (c) => {
  const body = c.req.valid("json");
  const { result, ...data } = await userService.searchUsersFuzzy(body);
  const userVos = result.map(e => UserVoConverterSchema.parse(e));
  return c.json(resp.ok({ result: userVos, ...data }));
};

export const userDetail: UserRouteHandler<"usersDetail"> = async (c) => {
  const { username } = c.req.valid("query");
  const userDetailDto = await userService.getUserDetailByUsername(username);
  const userDetailVo = UserDetailVoConverterSchema.parse(userDetailDto);
  return c.json(resp.ok(userDetailVo));
};

export const passwordReset: UserRouteHandler<"passwordReset"> = async (c) => {
  const { username } = c.req.valid("json");
  return await prisma.$transaction(async (tx) => {
    const user = await userRepository.getUserByUsername(username, tx);
    if (user === null) {
      throw new UserNotFoundError("用户名不存在");
    }
    const newPassword = generateRandomPassword(8);
    const newPasswordHash = await hash(newPassword, config.PASSWORD_HASH_ROUNDS);
    await userRepository.setPassword(user.id, newPasswordHash, tx);
    return c.json(resp.ok(newPassword));
  });
};

export const passwordGenerate: UserRouteHandler<"passwordGenerate"> = async (c) => {
  const data = generateRandomPassword(8);
  return c.json(resp.ok(data));
};

export const usersSet: UserRouteHandler<"usersSet"> = async (c) => {
  const users = c.req.valid("json").data;
  const data = await userService.setUsers(users);
  return c.json(resp.ok(data));
};
