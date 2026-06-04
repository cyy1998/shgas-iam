import type { User } from "@iam/db/schema";
import config from "@api/env";
import { WeakPasswordError } from "@iam/domain/user";
import { compare, hash } from "bcrypt-ts";

const LETTER_CHECK_REGEX = /[a-z]/i;
const DIGIT_CHECK_REGEX = /\d/;

export function isStrongPassword(password: string): boolean {
  if (password.length < 8) {
    return false;
  }
  return LETTER_CHECK_REGEX.test(password) && DIGIT_CHECK_REGEX.test(password);
}

export function assertStrongPassword(password: string) {
  if (!isStrongPassword(password)) {
    throw new WeakPasswordError("新密码强度过低");
  }
}

export async function hashUserPassword(password: string) {
  return await hash(password, config.PASSWORD_HASH_ROUNDS);
}

export async function verifyUserPassword(
  user: Pick<User, "password">,
  inputPassword: string,
) {
  if (user.password === null && config.NODE_ENV === "production") {
    return false;
  }
  return user.password
    ? await compare(inputPassword, user.password)
    : inputPassword === config.DEFAULT_USER_PASSWORD;
}
