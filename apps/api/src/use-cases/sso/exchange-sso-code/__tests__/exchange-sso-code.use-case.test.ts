import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import type { UserDetailDto } from "@iam/domain/user";
import { ClientManagementLevel, ClientStatus, UserStatus, UserType } from "@iam/contracts";
import { expect, mock, test } from "bun:test";
import { createExchangeSsoCodeUseCase } from "../exchange-sso-code.use-case";

const client = {
  id: 1,
  clientCode: "independent",
  clientName: "Independent",
  clientSecret: "secret",
  url: "https://app.example.com",
  status: ClientStatus.Enable,
  description: null,
  extAttributes: {
    callbackEndpoint: "https://app.example.com/sso/callback",
    logoutEndpoint: "https://app.example.com/sso/logout",
    managementLevel: ClientManagementLevel.Independent,
    requireOrcas: false,
    userExcluding: [],
    validRedirectUrls: ["https://app.example.com"],
  },
  isDelete: false,
  createTime: new Date("2026-01-01T00:00:00Z"),
  updateTime: new Date("2026-01-01T00:00:00Z"),
} satisfies CustomSsoClientRuntimeDto;

const userInfo = {
  id: 1001,
  username: "138550",
  wxId: null,
  name: "测试用户",
  mobile: "17721462865",
  userType: UserType.Formal,
  orderNum: 1,
  status: UserStatus.Enable,
  isDelete: false,
  createTime: new Date("2026-01-01T00:00:00Z"),
  updateTime: new Date("2026-01-01T00:00:00Z"),
  employments: [],
  roles: [],
  privileges: [],
} satisfies UserDetailDto;

test("delegates once and maps the Independent Client Credential to the existing response", async () => {
  const getClientByCode = mock(async () => client);
  const redeemIndependentGrant = mock(async () => ({
    credential: "iam-managed-credential",
    ttl: 3600,
    userInfo,
  }));
  const useCase = createExchangeSsoCodeUseCase({
    authorizationGrants: { redeemIndependentGrant },
    clients: { getClientByCode },
  });

  await expect(useCase.execute({
    clientCode: "independent",
    clientSecret: "secret",
    code: "auth-code",
  }, {
    requestContext: {
      sourceApp: "iam",
      requestId: "req-token",
      traceId: null,
      ip: null,
      userAgent: null,
      route: null,
      method: null,
    },
  })).resolves.toEqual({
    sid: "iam-managed-credential",
    ttl: 3600,
    userInfo,
  });

  expect(redeemIndependentGrant).toHaveBeenCalledTimes(1);
  expect(redeemIndependentGrant).toHaveBeenCalledWith({
    client,
    code: "auth-code",
    requestContext: {
      sourceApp: "iam",
      requestId: "req-token",
      traceId: null,
      ip: null,
      userAgent: null,
      route: null,
      method: null,
    },
  });
});

test("rejects a wrong client secret before redeeming the authorization grant", async () => {
  const redeemIndependentGrant = mock(async () => ({
    credential: "should-not-exist",
    ttl: 3600,
    userInfo,
  }));
  const useCase = createExchangeSsoCodeUseCase({
    authorizationGrants: { redeemIndependentGrant },
    clients: { getClientByCode: mock(async () => client) },
  });

  await expect(useCase.execute({
    clientCode: "independent",
    clientSecret: "wrong-secret",
    code: "auth-code",
  })).rejects.toThrow("非法Client");

  expect(redeemIndependentGrant).not.toHaveBeenCalled();
});

test("rejects an unknown client before redeeming the authorization grant", async () => {
  const redeemIndependentGrant = mock(async () => ({
    credential: "should-not-exist",
    ttl: 3600,
    userInfo,
  }));
  const useCase = createExchangeSsoCodeUseCase({
    authorizationGrants: { redeemIndependentGrant },
    clients: { getClientByCode: mock(async () => null) },
  });

  await expect(useCase.execute({
    clientCode: "missing",
    clientSecret: "secret",
    code: "auth-code",
  })).rejects.toThrow("非法Client");

  expect(redeemIndependentGrant).not.toHaveBeenCalled();
});
