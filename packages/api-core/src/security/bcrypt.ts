import { compare, hash } from "bcrypt-ts";

export async function hashSecret(secret: string, cost: number) {
  return await hash(secret, cost);
}

export async function verifySecret(secret: string, secretHash: string) {
  return await compare(secret, secretHash);
}
