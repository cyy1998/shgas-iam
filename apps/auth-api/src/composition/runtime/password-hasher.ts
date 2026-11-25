import { hashSecret, verifySecret } from "@iam/runtime/security/bcrypt";
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
