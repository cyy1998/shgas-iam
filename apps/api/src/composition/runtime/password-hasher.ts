import type { PasswordHasherPort } from "./types";
import { compare, hash } from "bcrypt-ts";

export function createApiPasswordHasher(cost: number): PasswordHasherPort {
  return {
    async hashPassword(password) {
      return await hash(password, cost);
    },
    async verifyPassword(password, hashedPassword) {
      return await compare(password, hashedPassword);
    },
  };
}
