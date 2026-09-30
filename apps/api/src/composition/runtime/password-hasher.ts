import { compare, hash } from "bcrypt-ts";
import type { PasswordHasherPort } from "./types";

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
