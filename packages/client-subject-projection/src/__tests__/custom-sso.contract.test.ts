import type { ClientSubjectProjection } from "@iam/client-subject-projection";
import {
  SubjectProjectionNotReadyError,
} from "@iam/client-subject-projection";
import {
  buildCustomSsoPlaceholderPreviewV1,
  CustomSsoSubjectProjectionInvariantError,
  CustomSsoSubjectProjectionV1Schema,
  resolveCustomSsoSubjectProjectionV1,
} from "@iam/client-subject-projection/custom-sso";
import { SubjectClaim } from "@iam/contracts";
import { describe, expect, test } from "bun:test";

const subjectIdentifier = "00000000-0000-4000-8000-000000000001";

async function resolveWire(projection: ClientSubjectProjection) {
  return await resolveCustomSsoSubjectProjectionV1({
    resolve: async () => projection,
  }, {
    subjectIdentifier,
    clientCode: "client-a",
    selection: { catalogVersion: 1, optionalClaims: [] },
  });
}

describe("Custom SSO V1 subject wire mapping contract", () => {
  test("rejects a projection for a different valid Subject Identifier without leaking either subject", async () => {
    const projectedSubjectIdentifier = "00000000-0000-4000-8000-000000000002";

    const result = resolveCustomSsoSubjectProjectionV1({
      resolve: async () => ({ subjectIdentifier: projectedSubjectIdentifier }),
    }, {
      subjectIdentifier,
      clientCode: "client-a",
      selection: { catalogVersion: 1, optionalClaims: [] },
    });

    await expect(result).rejects.toEqual(
      new CustomSsoSubjectProjectionInvariantError("subject_mismatch"),
    );
    await expect(result).rejects.not.toHaveProperty("subjectIdentifier");
    await expect(result).rejects.not.toHaveProperty("projection");
    await expect(result).rejects.not.toHaveProperty("cause");
    await expect(result).rejects.not.toHaveProperty("issues");
    await expect(result).rejects.not.toHaveProperty("wire");
    await expect(result).rejects.not.toHaveProperty("message", expect.stringContaining(subjectIdentifier));
    await expect(result).rejects.not.toHaveProperty("message", expect.stringContaining(projectedSubjectIdentifier));
  });

  test("converts an invalid runtime wire into one safe invariant error", async () => {
    const invalidProjection: ClientSubjectProjection = {
      subjectIdentifier,
      // @ts-expect-error exercises the runtime boundary beyond static types
      username: 42,
    };

    const result = resolveCustomSsoSubjectProjectionV1({
      resolve: async () => invalidProjection,
    }, {
      subjectIdentifier,
      clientCode: "client-a",
      selection: { catalogVersion: 1, optionalClaims: ["profile:username"] },
    });

    await expect(result).rejects.toEqual(
      new CustomSsoSubjectProjectionInvariantError("invalid_wire"),
    );
    await expect(result).rejects.not.toHaveProperty("cause");
    await expect(result).rejects.not.toHaveProperty("issues");
    await expect(result).rejects.not.toHaveProperty("wire");
  });

  test("converts a mapper failure into the same safe invalid Wire error", async () => {
    const invalidProjection: ClientSubjectProjection = {
      subjectIdentifier,
      // @ts-expect-error exercises a mapper failure at the runtime boundary
      employments: [null],
    };

    await expect(resolveWire(invalidProjection)).rejects.toEqual(
      new CustomSsoSubjectProjectionInvariantError("invalid_wire"),
    );
  });

  test.each([
    ["Subject Projection Not Ready", new SubjectProjectionNotReadyError()],
    ["an existing sentinel", new Error("existing projection failure")],
  ])("preserves %s errors from the Projection Service", async (_label, error) => {
    const result = resolveCustomSsoSubjectProjectionV1({
      resolve: async () => {
        throw error;
      },
    }, {
      subjectIdentifier,
      clientCode: "client-a",
      selection: { catalogVersion: 1, optionalClaims: [] },
    });

    await expect(result).rejects.toBe(error);
  });

  test("owns one strict runtime schema for every Custom SSO V1 consumer", async () => {
    const wire = await resolveWire({
      subjectIdentifier,
      username: "zhangsan",
    });

    expect(CustomSsoSubjectProjectionV1Schema.safeParse(wire).success).toBe(true);
    expect(() => CustomSsoSubjectProjectionV1Schema.parse({
      ...wire,
      databaseUserId: 1001,
    })).toThrow();
  });

  test("accepts an omitted profile parent and rejects an empty profile parent", () => {
    const wire = {
      version: 1 as const,
      subjectIdentifier,
    };

    expect(CustomSsoSubjectProjectionV1Schema.safeParse(wire).success).toBe(true);
    expect(CustomSsoSubjectProjectionV1Schema.safeParse({
      ...wire,
      profile: {},
    }).success).toBe(false);
  });

  test("maps the mandatory Subject Identifier into the versioned wire contract", async () => {
    const wire = await resolveWire({
      subjectIdentifier,
    });

    expect(wire).toEqual({
      version: 1,
      subjectIdentifier,
    });
  });

  test("nests selected profile scalars while omitting null phone and an empty parent", async () => {
    const [populated, empty] = await Promise.all([
      resolveWire({
        subjectIdentifier,
        username: "zhangsan",
        name: "张三",
        phone: null,
      }),
      resolveWire({
        subjectIdentifier,
        phone: null,
      }),
    ]);

    expect([populated, empty]).toEqual([
      {
        version: 1,
        subjectIdentifier,
        profile: {
          username: "zhangsan",
          name: "张三",
        },
      },
      {
        version: 1,
        subjectIdentifier,
      },
    ]);
  });

  test("keeps selected arrays present when their values are empty", async () => {
    const wire = await resolveWire({
      subjectIdentifier,
      employments: [],
      authorization: {
        employments: [],
        roles: [],
        privileges: [],
      },
    });

    expect(wire).toEqual({
      version: 1,
      subjectIdentifier,
      profile: {
        employments: [],
      },
      authorization: {
        employments: [],
        roles: [],
        privileges: [],
      },
    });
  });

  test("builds the fixed Admin preview through the production mapper", async () => {
    const scalarPreview = buildCustomSsoPlaceholderPreviewV1([
      SubjectClaim.SubjectIdentifier,
      SubjectClaim.ProfileUsername,
    ]);
    const arrayPreview = buildCustomSsoPlaceholderPreviewV1([
      SubjectClaim.SubjectIdentifier,
      SubjectClaim.ProfileEmployments,
      SubjectClaim.IamAuthorization,
    ]);

    expect(scalarPreview).toEqual(await resolveWire({
      subjectIdentifier,
      username: "zhangsan",
    }));
    expect(arrayPreview).toEqual(await resolveWire({
      subjectIdentifier,
      employments: [],
      authorization: {
        employments: [],
        roles: [],
        privileges: [],
      },
    }));
    expect(scalarPreview).not.toHaveProperty("profile.phone");
    expect(arrayPreview).toMatchObject({
      profile: { employments: [] },
      authorization: { employments: [], roles: [], privileges: [] },
    });
  });

  test("maps self-contained claims through an explicit wire whitelist without compatibility aliases", async () => {
    const employment = {
      id: 101,
      status: 1,
      isPrimary: true,
      organization: {
        id: 201,
        status: 1,
        code: "org-a",
        name: "甲部门",
        type: "department",
        path: [
          {
            id: 200,
            code: "root",
            name: "总部",
            type: "company",
          },
          {
            id: 201,
            code: "org-a",
            name: "甲部门",
            type: "department",
          },
        ],
      },
      position: {
        id: 301,
        code: "position-a",
        name: "甲岗位",
        description: "must not enter the wire contract",
      },
    };
    const projection = {
      subjectIdentifier,
      username: "zhangsan",
      name: "张三",
      phone: "13800000000",
      employments: [employment],
      authorization: {
        employments: [{
          ...employment,
          roles: ["admin"],
          privileges: ["read"],
          authorizationDecision: "allow",
        }],
        roles: ["admin"],
        privileges: ["read"],
        authorizationDecision: "allow",
      },
      id: 1001,
      userInfo: { username: "legacy" },
      compatibilityAlias: "legacy",
    };
    const wire = await resolveWire(projection);

    const wireEmployment = {
      isPrimary: true,
      organization: {
        code: "org-a",
        name: "甲部门",
        type: "department",
        path: [
          { code: "root", name: "总部", type: "company" },
          { code: "org-a", name: "甲部门", type: "department" },
        ],
      },
      position: {
        code: "position-a",
        name: "甲岗位",
      },
    };
    expect(wire).toEqual({
      version: 1,
      subjectIdentifier,
      profile: {
        username: "zhangsan",
        name: "张三",
        phone: "13800000000",
        employments: [wireEmployment],
      },
      authorization: {
        employments: [{
          ...wireEmployment,
          roles: ["admin"],
          privileges: ["read"],
        }],
        roles: ["admin"],
        privileges: ["read"],
      },
    });
  });
});
