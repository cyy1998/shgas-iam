import { createHmac } from "node:crypto";

export function hmacSha256(data: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(data)
    .digest("hex"); // 也可以用 'base64'
}

export function generateRandomPassword(length = 8) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
