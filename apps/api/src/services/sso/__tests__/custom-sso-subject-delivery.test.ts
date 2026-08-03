import type { SubjectClaimName } from "@iam/contracts";
import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import {
  CustomSsoClientRuntimeUnavailableError,
} from "@api/services/client/custom-sso-client-runtime.reader";
import {
  CustomSsoClientDeliveryUnauthorizedError,
} from "@api/services/sso/custom-sso-client-delivery.error";
import {
  createCustomSsoSubjectDelivery,
} from "@api/services/sso/custom-sso-subject-delivery";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import {
  createClientSubjectProjectionService,
} from "@iam/client-subject-projection";
import {
  ClientStatus,
  CustomSsoClientMode,
  SubjectClaim,
} from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const SUBJECT_IDENTIFIER = "00000000-0000-4000-8000-000000001001";

function runtimeClient(
  subjectClaims: readonly SubjectClaimName[],
  overrides: Partial<CustomSsoClientRuntimeDto> = {},
): CustomSsoClientRuntimeDto {
  return {
    id: 7,
    clientCode: "gateway",
    clientName: "Gateway",
    status: ClientStatus.Enable,
    isDelete: false,
    customSsoEnabled: true,
    customSsoConfig: {
      mode: CustomSsoClientMode.Gateway,
      orcas: { enabled: true },
      subjectClaimCatalogVersion: 1,
      subjectClaims: [...subjectClaims],
      validRedirectUrls: ["https://gateway.example.com/callback"],
    },
    customSsoConfigVersion: 3,
    ...overrides,
  };
}

const subjectFacts = {
  subjectIdentifier: SUBJECT_IDENTIFIER,
  sourceDirtyVersion: "9",
  profile: {
    username: "alice",
    name: "Alice",
    phone: "13800138000",
  },
  employments: [{
    isPrimary: true,
    organization: {
      code: "engineering",
      name: "Engineering",
      type: "department",
      path: [{
        code: "root",
        name: "Root",
        type: "company",
      }],
    },
    position: {
      code: "developer",
      name: "Developer",
    },
    clientAuthorizations: [
      {
        clientCode: "gateway",
        roles: [{
          code: "gateway-user",
          privileges: ["gateway:read"],
        }],
      },
      {
        clientCode: "other-client",
        roles: [{
          code: "other-admin",
          privileges: ["other:write"],
        }],
      },
    ],
  }],
};

const factsRead = mock(async () => subjectFacts);
const freshnessCheck = mock(async () => ({ status: "fresh" as const }));
const assertAccessible = mock(async () => undefined);

function createDelivery(client: CustomSsoClientRuntimeDto) {
  const findRuntimeRecord = mock(async () => client);
  const projection = createClientSubjectProjectionService({
    subjectAccess: { assertAccessible },
    subjectFacts: { read: factsRead },
    authorizationFreshness: { check: freshnessCheck },
  });
  return {
    delivery: createCustomSsoSubjectDelivery({
      clients: { findRuntimeRecord },
      projection,
    }),
    findRuntimeRecord,
  };
}

beforeEach(() => {
  factsRead.mockClear();
  freshnessCheck.mockClear();
  assertAccessible.mockClear();
});

describe("Custom SSO subject delivery", () => {
  test("builds a subject-only Gateway header without reading Subject Facts", async () => {
    const { delivery } = createDelivery(runtimeClient([
      SubjectClaim.SubjectIdentifier,
    ]));

    const encoded = await delivery.resolveGatewaySubjectHeader({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      authenticatedClientCode: "gateway",
      expectedConfigVersion: 3,
    });

    expect(JSON.parse(Buffer.from(encoded, "base64").toString("utf8"))).toEqual({
      version: 1,
      subjectIdentifier: SUBJECT_IDENTIFIER,
    });
    expect(factsRead).not.toHaveBeenCalled();
    expect(freshnessCheck).not.toHaveBeenCalled();
  });

  test("hard-filters a wide client selection to username and name for Gateway authz", async () => {
    const { delivery } = createDelivery(runtimeClient([
      SubjectClaim.SubjectIdentifier,
      SubjectClaim.ProfileUsername,
      SubjectClaim.ProfileName,
      SubjectClaim.ProfilePhone,
      SubjectClaim.ProfileEmployments,
      SubjectClaim.IamAuthorization,
    ]));

    const encoded = await delivery.resolveGatewaySubjectHeader({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      authenticatedClientCode: "gateway",
      expectedConfigVersion: 3,
    });
    const decoded = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8"),
    );

    expect(decoded).toEqual({
      version: 1,
      subjectIdentifier: SUBJECT_IDENTIFIER,
      username: "alice",
      name: "Alice",
    });
    expect(JSON.stringify(decoded)).not.toContain("phone");
    expect(JSON.stringify(decoded)).not.toContain("employment");
    expect(JSON.stringify(decoded)).not.toContain("authorization");
    expect(JSON.stringify(decoded)).not.toContain("orcas");
    expect(JSON.stringify(decoded)).not.toContain("id");
    expect(factsRead).toHaveBeenCalledTimes(1);
    expect(freshnessCheck).not.toHaveBeenCalled();
  });

  test("uses the complete current client selection for public user-info", async () => {
    const { delivery } = createDelivery(runtimeClient([
      SubjectClaim.SubjectIdentifier,
      SubjectClaim.ProfileUsername,
      SubjectClaim.ProfileName,
      SubjectClaim.ProfilePhone,
      SubjectClaim.ProfileEmployments,
      SubjectClaim.IamAuthorization,
    ]));

    const projection = await delivery.createUserInfoCapability({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      authenticatedClientCode: "gateway",
      expectedConfigVersion: 3,
    }).resolveUserInfo();

    expect(projection).toMatchObject({
      version: 1,
      subjectIdentifier: SUBJECT_IDENTIFIER,
      profile: {
        username: "alice",
        name: "Alice",
        phone: "13800138000",
        employments: [{
          organization: { code: "engineering" },
          position: { code: "developer" },
        }],
      },
      authorization: {
        roles: ["gateway-user"],
        privileges: ["gateway:read"],
      },
    });
    expect(JSON.stringify(projection)).not.toContain("other-admin");
    expect(JSON.stringify(projection)).not.toContain("other:write");
    expect(JSON.stringify(projection)).not.toContain("orcas");
    expect(freshnessCheck).toHaveBeenCalledTimes(1);
  });

  test("does not project a local session through a newer client selection", async () => {
    const initial = runtimeClient([
      SubjectClaim.SubjectIdentifier,
      SubjectClaim.ProfileUsername,
    ]);
    const changed = runtimeClient([
      SubjectClaim.SubjectIdentifier,
      SubjectClaim.ProfilePhone,
    ], {
      customSsoConfigVersion: 4,
    });
    const { delivery, findRuntimeRecord } = createDelivery(initial);
    findRuntimeRecord.mockResolvedValueOnce(initial);
    findRuntimeRecord.mockResolvedValueOnce(changed);

    const capability = delivery.createUserInfoCapability({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      authenticatedClientCode: "gateway",
      expectedConfigVersion: 3,
    });

    expect(Object.keys(capability)).toEqual(["resolveUserInfo"]);
    await expect(
      capability.resolveUserInfo(),
    ).rejects.toBeInstanceOf(
      CustomSsoClientDeliveryUnauthorizedError,
    );

    expect(findRuntimeRecord).toHaveBeenCalledTimes(2);
  });

  test("returns retryable uncertainty when a global session races a client selection change", async () => {
    const initial = runtimeClient([
      SubjectClaim.SubjectIdentifier,
      SubjectClaim.ProfileUsername,
    ]);
    const changed = runtimeClient([
      SubjectClaim.SubjectIdentifier,
      SubjectClaim.ProfilePhone,
    ], {
      customSsoConfigVersion: 4,
    });
    const { delivery, findRuntimeRecord } = createDelivery(initial);
    findRuntimeRecord.mockResolvedValueOnce(initial);
    findRuntimeRecord.mockResolvedValueOnce(changed);

    await expect(delivery.createUserInfoCapability({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      authenticatedClientCode: "gateway",
    }).resolveUserInfo()).rejects.toBeInstanceOf(
      CustomSsoClientRuntimeUnavailableError,
    );

    expect(findRuntimeRecord).toHaveBeenCalledTimes(2);
  });

  test.each([
    [
      "a Gateway Local Session",
      { expectedConfigVersion: 3 },
      CustomSsoClientDeliveryUnauthorizedError,
    ],
    [
      "a global session",
      {},
      CustomSsoClientRuntimeUnavailableError,
    ],
  ] as const)("revalidates %s after one Gateway projection", async (
    _sessionType,
    context,
    ExpectedError,
  ) => {
    const initial = runtimeClient([SubjectClaim.SubjectIdentifier]);
    const changed = runtimeClient([SubjectClaim.SubjectIdentifier], {
      customSsoConfigVersion: 4,
    });
    const findRuntimeRecord = mock()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(changed);
    const resolve = mock(async () => ({
      subjectIdentifier: SUBJECT_IDENTIFIER,
    }));
    const delivery = createCustomSsoSubjectDelivery({
      clients: { findRuntimeRecord },
      projection: { resolve },
    });

    await expect(delivery.resolveGatewaySubjectHeader({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      authenticatedClientCode: "gateway",
      ...context,
    })).rejects.toBeInstanceOf(ExpectedError);

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(findRuntimeRecord).toHaveBeenCalledTimes(2);
  });

  test.each([
    [
      "public user-info",
      async (delivery: ReturnType<typeof createCustomSsoSubjectDelivery>) =>
        await delivery.createUserInfoCapability({
          subjectIdentifier: SUBJECT_IDENTIFIER,
          authenticatedClientCode: "gateway",
        }).resolveUserInfo(),
    ],
    [
      "the Gateway header",
      async (delivery: ReturnType<typeof createCustomSsoSubjectDelivery>) =>
        await delivery.resolveGatewaySubjectHeader({
          subjectIdentifier: SUBJECT_IDENTIFIER,
          authenticatedClientCode: "gateway",
        }),
    ],
  ] as const)("validates the projected Subject before reloading the Client for %s", async (
    _deliveryType,
    deliver,
  ) => {
    const findRuntimeRecord = mock(async () =>
      runtimeClient([SubjectClaim.SubjectIdentifier]));
    const resolve = mock(async () => ({
      subjectIdentifier: "00000000-0000-4000-8000-000000001002",
    }));
    const delivery = createCustomSsoSubjectDelivery({
      clients: { findRuntimeRecord },
      projection: { resolve },
    });

    await expect(deliver(delivery)).rejects.toBeInstanceOf(TypeError);

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(findRuntimeRecord).toHaveBeenCalledTimes(1);
  });

  test.each([
    [
      "global disable",
      runtimeClient([SubjectClaim.SubjectIdentifier], {
        status: ClientStatus.Disable,
      }),
    ],
    [
      "deletion",
      runtimeClient([SubjectClaim.SubjectIdentifier], {
        isDelete: true,
      }),
    ],
    [
      "Custom SSO disable",
      runtimeClient([SubjectClaim.SubjectIdentifier], {
        customSsoEnabled: false,
      }),
    ],
    [
      "config removal",
      runtimeClient([SubjectClaim.SubjectIdentifier], {
        customSsoConfig: null,
      }),
    ],
  ] as const)("classifies a mid-flight %s as client-local delivery rejection", async (
    _reason,
    changed,
  ) => {
    const initial = runtimeClient([SubjectClaim.SubjectIdentifier]);
    const { delivery, findRuntimeRecord } = createDelivery(initial);
    findRuntimeRecord.mockResolvedValueOnce(initial);
    findRuntimeRecord.mockResolvedValueOnce(changed);

    await expect(delivery.createUserInfoCapability({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      authenticatedClientCode: "gateway",
    }).resolveUserInfo()).rejects.toBeInstanceOf(
      CustomSsoClientDeliveryUnauthorizedError,
    );

    expect(findRuntimeRecord).toHaveBeenCalledTimes(2);
  });

  test.each([
    [
      "missing",
      null,
    ],
    [
      "globally disabled",
      runtimeClient([SubjectClaim.SubjectIdentifier], {
        status: ClientStatus.Disable,
      }),
    ],
    [
      "Custom SSO disabled",
      runtimeClient([SubjectClaim.SubjectIdentifier], {
        customSsoEnabled: false,
      }),
    ],
    [
      "unconfigured",
      runtimeClient([SubjectClaim.SubjectIdentifier], {
        customSsoConfig: null,
      }),
    ],
  ] as const)("fails closed before projection for a %s current client", async (
    _reason,
    client,
  ) => {
    const resolve = mock(async () => {
      throw new Error("projection must not run");
    });
    const delivery = createCustomSsoSubjectDelivery({
      clients: { findRuntimeRecord: mock(async () => client) },
      projection: { resolve },
    });

    await expect(delivery.createUserInfoCapability({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      authenticatedClientCode: "gateway",
    }).resolveUserInfo()).rejects.toBeInstanceOf(
      CustomSsoClientDeliveryUnauthorizedError,
    );
    expect(resolve).not.toHaveBeenCalled();
  });

  test("rejects an Independent client at the Gateway header boundary", async () => {
    const client = runtimeClient([SubjectClaim.SubjectIdentifier], {
      customSsoConfig: {
        mode: CustomSsoClientMode.Independent,
        subjectClaimCatalogVersion: 1,
        subjectClaims: [SubjectClaim.SubjectIdentifier],
        validRedirectUrls: ["https://app.example.com/callback"],
        callbackEndpoint: "https://app.example.com/callback",
        logoutEndpoint: "https://app.example.com/logout",
      },
    });
    const { delivery } = createDelivery(client);

    await expect(delivery.resolveGatewaySubjectHeader({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      authenticatedClientCode: "gateway",
    })).rejects.toBeInstanceOf(AuthzUnauthorizedError);
    expect(factsRead).not.toHaveBeenCalled();
  });
});
