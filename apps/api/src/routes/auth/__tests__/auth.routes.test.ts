import { describe, expect, test } from "bun:test";
import { internalAuthz, loginPassword } from "../auth.routes";

const loginPasswordSchema = loginPassword.request.body.content["application/json"].schema;
const internalAuthzSuccessSchema = internalAuthz.responses[200].content["application/json"].schema;

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

  test("internal authz success response carries boolean data", () => {
    expect(internalAuthzSuccessSchema.safeParse({
      code: 200,
      data: true,
      message: "success",
    }).success).toBe(true);

    expect(internalAuthzSuccessSchema.safeParse({
      code: 200,
      data: {},
      message: "success",
    }).success).toBe(false);
  });
});
