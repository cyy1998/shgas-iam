import * as resp from "@iam/api-core/http";
import { ClientStatus } from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.restore();

type InternalTestClient = {
  clientCode: string;
  clientSecret: string;
  isDelete: boolean;
  status: ClientStatus;
};

const parseLoginPasswordCredential = mock(async () => ({
  username: "138550",
  password: "1234",
}));
const loginPasswordService = mock(async () => ({
  token: "session-id",
  isMobileSet: true,
}));
const getClientBySecret = mock(async (_secret: string): Promise<InternalTestClient | null> => null);
const cookieCalls: unknown[][] = [];

mock.module("hono/cookie", () => ({
  deleteCookie: mock(),
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

mock.module("@api/services/client/client.service", () => ({
  getClientBySecret,
}));

mock.module("../login-credential.helper", () => ({
  parseLoginPasswordCredential,
}));

mock.module("../auth.service", () => ({
  loginPassword: loginPasswordService,
}));

const { internalAuthz, loginPassword } = await import("../auth.handlers");

function makeLoginContext() {
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

function makeHeaderContext(headers: Record<string, string>) {
  return {
    req: {
      header(name: string) {
        return headers[name] ?? headers[name.toLowerCase()];
      },
    },
    json: mock((body: unknown) => body),
  };
}

beforeEach(() => {
  cookieCalls.length = 0;
  parseLoginPasswordCredential.mockClear();
  loginPasswordService.mockClear();
  getClientBySecret.mockClear();
  getClientBySecret.mockImplementation(async () => null);
});

describe("auth handlers", () => {
  test("password login decrypts credential before calling auth service", async () => {
    const context = makeLoginContext();

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

  test("internal authz rejects forged IP-Chain without a valid apikey", async () => {
    const context = makeHeaderContext({
      "IP-Chain": "10.0.0.1, 192.168.93.10",
    });

    await expect(internalAuthz(context as never, undefined as never)).rejects.toThrow("非法访问");

    expect(getClientBySecret).not.toHaveBeenCalled();
  });

  test("internal authz returns boolean success for an active client apikey", async () => {
    getClientBySecret.mockImplementation(async () => ({
      clientCode: "portal",
      clientSecret: "secret-1",
      isDelete: false,
      status: ClientStatus.Enable,
    }));
    const context = makeHeaderContext({
      "apikey": "secret-1",
      "IP-Chain": "10.0.0.1, 192.168.93.10",
    });

    await expect(internalAuthz(context as never, undefined as never)).resolves.toEqual(resp.ok(true));

    expect(getClientBySecret).toHaveBeenCalledWith("secret-1");
  });
});
