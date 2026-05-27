import * as resp from "@iam/api-core/http";
import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.restore();

const parseLoginPasswordCredential = mock(async () => ({
  username: "138550",
  password: "1234",
}));
const loginPasswordService = mock(async () => ({
  token: "session-id",
  isMobileSet: true,
}));
const cookieCalls: unknown[][] = [];

mock.module("hono/cookie", () => ({
  getCookie: mock(),
  setCookie: mock((...args: unknown[]) => {
    cookieCalls.push(args);
  }),
}));

mock.module("@api/env", () => ({
  default: {
    REDIS_EXPIRE_TIME: 3600,
  },
}));

mock.module("@api/lib/infra/redis", () => ({
  default: {},
}));

mock.module("@api/services/client/client.service", () => ({}));

mock.module("../login-credential.service", () => ({
  parseLoginPasswordCredential,
}));

mock.module("../auth.service", () => ({
  loginPassword: loginPasswordService,
}));

const { loginPassword } = await import("../auth.handlers");

function makeContext() {
  return {
    req: {
      valid() {
        return {
          credential: "iam-login-v1.payload",
          capToken: "cap-token",
        };
      },
      header(name: string) {
        return name === "Client" ? "iam" : undefined;
      },
    },
    json: mock((body: unknown) => body),
  };
}

beforeEach(() => {
  cookieCalls.length = 0;
  parseLoginPasswordCredential.mockClear();
  loginPasswordService.mockClear();
});

describe("auth handlers", () => {
  test("password login decrypts credential before calling auth service", async () => {
    const context = makeContext();

    await expect(loginPassword(context as never, undefined as never)).resolves.toEqual(resp.ok({
      token: "session-id",
      isMobileSet: true,
    }));

    expect(parseLoginPasswordCredential).toHaveBeenCalledWith("iam-login-v1.payload");
    expect(loginPasswordService).toHaveBeenCalledWith("138550", "1234", {
      capToken: "cap-token",
      context: {
        subject: "138550",
        ip: undefined,
      },
    });
    expect(cookieCalls[0]?.slice(1, 4)).toEqual(["global_session", "session-id", {
      httpOnly: true,
      sameSite: "Lax",
      maxAge: 3600,
      path: "/",
    }]);
  });
});
