import type { User } from "@iam/db/schema";
import type { UserPasswordHelperDeps } from "./user.port";
import { WeakPasswordError } from "@iam/domain/user";

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

export function createUserPasswordHelper(deps: UserPasswordHelperDeps) {
  async function hashUserPassword(password: string) {
    return await deps.passwordHasher.hashPassword(password);
  }

  async function verifyUserPassword(
    user: Pick<User, "password">,
    inputPassword: string,
  ) {
    return user.password
      ? await deps.passwordHasher.verifyPassword(inputPassword, user.password)
      : false;
  }

  return {
    assertStrongPassword,
    hashUserPassword,
    verifyUserPassword,
  };
}

export type UserPasswordHelper = ReturnType<typeof createUserPasswordHelper>;
