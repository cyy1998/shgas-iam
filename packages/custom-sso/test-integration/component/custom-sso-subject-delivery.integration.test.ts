import type { SubjectClaimName } from "@iam/contracts";
import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import { Buffer } from "node:buffer";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import {
  createPermittedClientSubjectProjectionService,
} from "@iam/client-subject-projection";
import {
  ClientStatus,
  CustomSsoClientMode,
  OrganizationResponsibilityTypeCode,
  OrganizationType,
  SubjectClaim,
} from "@iam/contracts";
import {
  CustomSsoClientDeliveryUnauthorizedError,
} from "@iam/custom-sso";
import {
  createCustomSsoSubjectDelivery,
} from "@iam/custom-sso/testing";
import { CustomSsoSubjectProjectionInvariantError } from "@iam/custom-sso/wire";
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
    responsibilities: [{
      type: {
        code: OrganizationResponsibilityTypeCode.Head,
        name: "负责人",
      },
      targetOrganization: {
        code: "engineering",
        name: "Engineering",
        type: OrganizationType.Department,
        path: [{
          code: "root",
          name: "Root",
          type: OrganizationType.Company,
        }, {
          code: "engineering",
          name: "Engineering",
          type: OrganizationType.Department,
        }],
      },
    }],
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
const permission = {};
const assertPermission = mock((value: object) => {
  if (value !== permission)
    throw new Error("permission required");
});

function createDelivery(client: CustomSsoClientRuntimeDto) {
  const projection = createPermittedClientSubjectProjectionService({
    assertPermission,
    subjectFacts: { read: factsRead },
  });
  const rawDelivery = createCustomSsoSubjectDelivery({ projection: { resolve: input => projection.resolve(input, permission) } });
  return {
    delivery: {
      createUserInfoCapability: (
        context: Parameters<typeof rawDelivery.createUserInfoCapability>[0],
      ) => rawDelivery.createUserInfoCapability(context, client),
      resolveGatewaySubjectHeader: (
        context: Parameters<typeof rawDelivery.resolveGatewaySubjectHeader>[0],
      ) => rawDelivery.resolveGatewaySubjectHeader(context, client),
    },
  };
}

beforeEach(() => {
  factsRead.mockClear();
  assertPermission.mockClear();
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
      version: 2,
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
  });

  test("keeps the accepted request selection when the client mutates during projection", async () => {
    const accepted = runtimeClient([
      SubjectClaim.SubjectIdentifier,
      SubjectClaim.ProfileUsername,
    ]);
    let current = accepted;
    const changed = runtimeClient([
      SubjectClaim.SubjectIdentifier,
      SubjectClaim.ProfilePhone,
    ], {
      customSsoConfigVersion: 4,
    });
    const resolve = mock(async () => {
      current = changed;
      return {
        subjectIdentifier: SUBJECT_IDENTIFIER,
        username: "alice",
      };
    });
    const delivery = createCustomSsoSubjectDelivery({
      projection: { resolve },
    });
    const capability = delivery.createUserInfoCapability({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      authenticatedClientCode: "gateway",
      expectedConfigVersion: 3,
    }, accepted);

    expect(Object.keys(capability)).toEqual(["resolveUserInfo"]);
    const projection = await capability.resolveUserInfo();
    expect(projection).toEqual({
      version: 2,
      subjectIdentifier: SUBJECT_IDENTIFIER,
      profile: { username: "alice" },
    });
    expect(current).toBe(changed);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  test.each([
    [
      "public user-info",
      async (
        delivery: ReturnType<typeof createCustomSsoSubjectDelivery>,
        client: CustomSsoClientRuntimeDto,
      ) =>
        await delivery.createUserInfoCapability({
          subjectIdentifier: SUBJECT_IDENTIFIER,
          authenticatedClientCode: "gateway",
        }, client).resolveUserInfo(),
      CustomSsoSubjectProjectionInvariantError,
    ],
    [
      "the Gateway header",
      async (
        delivery: ReturnType<typeof createCustomSsoSubjectDelivery>,
        client: CustomSsoClientRuntimeDto,
      ) =>
        await delivery.resolveGatewaySubjectHeader({
          subjectIdentifier: SUBJECT_IDENTIFIER,
          authenticatedClientCode: "gateway",
        }, client),
      TypeError,
    ],
  ] as const)("validates the projected Subject for %s", async (
    _deliveryType,
    deliver,
    ExpectedError,
  ) => {
    const client = runtimeClient([SubjectClaim.SubjectIdentifier]);
    const resolve = mock(async () => ({
      subjectIdentifier: "00000000-0000-4000-8000-000000001002",
    }));
    const delivery = createCustomSsoSubjectDelivery({
      projection: { resolve },
    });

    await expect(deliver(delivery, client)).rejects.toBeInstanceOf(ExpectedError);

    expect(resolve).toHaveBeenCalledTimes(1);
  });

  test.each([
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
      projection: { resolve },
    });

    let error: unknown;
    try {
      delivery.createUserInfoCapability({
        subjectIdentifier: SUBJECT_IDENTIFIER,
        authenticatedClientCode: "gateway",
      }, client);
    }
    catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(CustomSsoClientDeliveryUnauthorizedError);
    expect(resolve).not.toHaveBeenCalled();
  });

  test("rejects an Independent client at the Gateway header boundary", async () => {
    const client = runtimeClient([SubjectClaim.SubjectIdentifier], {
      customSsoConfig: {
        mode: CustomSsoClientMode.Independent,
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
