import { hash as hashSecret, compare as verifySecret } from "bcrypt-ts";
import type { PasswordHasherPort } from "./types";

export function createApiPasswordHasher(cost: number): PasswordHasherPort {
  return {
    async hashPassword(password) {
      return await hashSecret(password, cost);
    },
    async verifyPassword(password, hashedPassword) {
      return await verifySecret(password, hashedPassword);
    },
  };
}
