import { describe, expect, test } from "bun:test";
import { loginPassword } from "../auth.routes";

const loginPasswordSchema = loginPassword.request.body.content["application/json"].schema;

describe("auth routes", () => {
  test("password login accepts encrypted credential payload", () => {
    expect(loginPasswordSchema.safeParse({
      credential: "iam-login-v1.payload",
      capToken: "cap-token",
    }).success).toBe(true);
  });

  test("password login rejects legacy plaintext payload", () => {
    expect(loginPasswordSchema.safeParse({
      username: "138550",
      password: "1234",
    }).success).toBe(false);
  });
});
