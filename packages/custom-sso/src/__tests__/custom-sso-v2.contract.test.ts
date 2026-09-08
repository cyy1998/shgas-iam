import type {
  ClientSubjectProjection,
  EmploymentResponsibilitySnapshot,
} from "@iam/client-subject-projection";
import { SubjectProjectionNotReadyError } from "@iam/client-subject-projection";
import {
  OrganizationResponsibilityTypeCode,
  OrganizationType,
  SubjectClaim,
} from "@iam/contracts";
import {
  buildCustomSsoPlaceholderPreview,
  CustomSsoSubjectProjectionInvariantError,
  CustomSsoSubjectProjectionSchema,
  resolveCustomSsoSubjectProjection,
} from "@iam/custom-sso/wire";
import { describe, expect, test } from "bun:test";

const subjectIdentifier = "00000000-0000-4000-8000-000000000001";

describe("Custom SSO V2 subject wire mapping contract", () => {
  test("maps responsibilities only into profile employments", async () => {
    const employment = {
      isPrimary: true,
      organization: {
        code: "org-a",
        name: "甲部门",
        type: OrganizationType.Department,
        path: [
          { code: "root", name: "总部", type: OrganizationType.Company },
          { code: "org-a", name: "甲部门", type: OrganizationType.Department },
        ],
      },
      position: { code: "position-a", name: "甲岗位" },
    };
    const responsibilities: EmploymentResponsibilitySnapshot[] = [{
      type: {
        code: OrganizationResponsibilityTypeCode.Head,
        name: "负责人",
      },
      targetOrganization: {
        code: "target-a",
        name: "目标甲",
        type: OrganizationType.Department,
        path: [
          { code: "root", name: "总部", type: OrganizationType.Company },
          {
            code: "target-a",
            name: "目标甲",
            type: OrganizationType.Department,
          },
        ],
      },
    }];
    const projection: ClientSubjectProjection = {
      subjectIdentifier,
      employments: [{
        ...employment,
        responsibilities,
      }],
      authorization: {
        employments: [{
          ...employment,
          roles: ["admin"],
          privileges: ["read"],
        }],
        roles: ["admin"],
        privileges: ["read"],
      },
    };

    const wire = await resolveCustomSsoSubjectProjection({
      resolve: async () => projection,
    }, {
      subjectIdentifier,
      clientCode: "client-a",
      selection: {
        catalogVersion: 2,
        optionalClaims: ["profile:employments", "iam:authorization"],
      },
    });

    expect(wire).toMatchObject({
      version: 2,
      profile: {
        employments: [{
          organization: { code: "org-a" },
          position: { code: "position-a" },
          responsibilities: [{
            type: { code: OrganizationResponsibilityTypeCode.Head },
            targetOrganization: { code: "target-a" },
          }],
        }],
      },
      authorization: {
        employments: [{
          organization: { code: "org-a" },
          roles: ["admin"],
          privileges: ["read"],
        }],
      },
    });
    expect(wire.authorization?.employments[0])
      .not
      .toHaveProperty("responsibilities");
  });

  test("fails the whole wire for missing, unknown, or malformed responsibilities", async () => {
    const baseEmployment = {
      isPrimary: true,
      organization: {
        code: "org-a",
        name: "甲部门",
        type: OrganizationType.Department,
        path: [{
          code: "org-a",
          name: "甲部门",
          type: OrganizationType.Department,
        }],
      },
      position: { code: "position-a", name: "甲岗位" },
    };
    const invalidWires = [
      {
        version: 2,
        subjectIdentifier,
        profile: { employments: [baseEmployment] },
      },
      {
        version: 2,
        subjectIdentifier,
        profile: {
          employments: [{
            ...baseEmployment,
            responsibilities: [{
              type: {
                code: OrganizationResponsibilityTypeCode.Head,
                name: "WRONG",
              },
              targetOrganization: {
                code: "target-a",
                name: "目标甲",
                type: OrganizationType.Department,
                path: [{
                  code: "different-target",
                  name: "另一组织",
                  type: OrganizationType.Department,
                }],
              },
            }],
          }],
        },
      },
      {
        version: 2,
        subjectIdentifier,
        profile: {
          employments: [{
            ...baseEmployment,
            responsibilities: [{
              type: {
                code: OrganizationResponsibilityTypeCode.Head,
                name: "负责人",
                unknown: true,
              },
              targetOrganization: {
                code: "target-a",
                name: "目标甲",
                type: OrganizationType.Department,
                path: [{
                  code: "target-a",
                  name: "目标甲",
                  type: OrganizationType.Department,
                }],
              },
            }],
          }],
        },
      },
      {
        version: 2,
        subjectIdentifier,
        profile: {
          employments: [{
            ...baseEmployment,
            responsibilities: [{
              type: { code: "owner", name: "负责人" },
              targetOrganization: {
                code: "target-a",
                name: "目标甲",
                type: OrganizationType.Department,
                path: [{
                  code: "target-a",
                  name: "目标甲",
                  type: OrganizationType.Department,
                }],
              },
            }],
          }],
        },
      },
    ];

    for (const wire of invalidWires)
      expect(CustomSsoSubjectProjectionSchema.safeParse(wire).success).toBe(false);

    const invalidProjection = {
      subjectIdentifier,
      employments: [baseEmployment],
    };
    const result = await captureRejection(resolveCustomSsoSubjectProjection({
      // @ts-expect-error exercises the runtime boundary beyond static types
      resolve: async () => invalidProjection,
    }, {
      subjectIdentifier,
      clientCode: "client-a",
      selection: {
        catalogVersion: 2,
        optionalClaims: ["profile:employments"],
      },
    }));

    expect(result).toEqual(
      new CustomSsoSubjectProjectionInvariantError("invalid_wire"),
    );
    expect(result).not.toHaveProperty("cause");
    expect(result).not.toHaveProperty("wire");
  });

  test("rejects a projection for a different valid Subject Identifier without leaking either subject", async () => {
    const projectedSubjectIdentifier = "00000000-0000-4000-8000-000000000002";

    const result = await captureRejection(resolveCustomSsoSubjectProjection({
      resolve: async () => ({ subjectIdentifier: projectedSubjectIdentifier }),
    }, {
      subjectIdentifier,
      clientCode: "client-a",
      selection: { catalogVersion: 2, optionalClaims: [] },
    }));

    expect(result).toEqual(
      new CustomSsoSubjectProjectionInvariantError("subject_mismatch"),
    );
    expect(result).not.toHaveProperty("subjectIdentifier");
    expect(result).not.toHaveProperty("projection");
    expect(result).not.toHaveProperty("cause");
    expect(result).not.toHaveProperty("issues");
    expect(result).not.toHaveProperty("wire");
    expect(result).not.toHaveProperty("message", expect.stringContaining(subjectIdentifier));
    expect(result).not.toHaveProperty("message", expect.stringContaining(projectedSubjectIdentifier));
  });

  test("converts an invalid runtime wire into one safe invariant error", async () => {
    const invalidProjection: ClientSubjectProjection = {
      subjectIdentifier,
      // @ts-expect-error exercises the runtime boundary beyond static types
      username: 42,
    };

    const result = await captureRejection(resolveCustomSsoSubjectProjection({
      resolve: async () => invalidProjection,
    }, {
      subjectIdentifier,
      clientCode: "client-a",
      selection: { catalogVersion: 2, optionalClaims: ["profile:username"] },
    }));

    expect(result).toEqual(
      new CustomSsoSubjectProjectionInvariantError("invalid_wire"),
    );
    expect(result).not.toHaveProperty("cause");
    expect(result).not.toHaveProperty("issues");
    expect(result).not.toHaveProperty("wire");
  });

  test("converts a mapper failure into the same safe invalid Wire error", async () => {
    const invalidProjection: ClientSubjectProjection = {
      subjectIdentifier,
      // @ts-expect-error exercises a mapper failure at the runtime boundary
      employments: [null],
    };

    const failure = await captureRejection(resolveWire(invalidProjection));
    expect(failure).toEqual(
      new CustomSsoSubjectProjectionInvariantError("invalid_wire"),
    );
  });

  test.each([
    ["Subject Projection Not Ready", new SubjectProjectionNotReadyError()],
    ["an existing sentinel", new Error("existing projection failure")],
  ])("preserves %s errors from the Projection Service", async (_label, error) => {
    const result = await captureRejection(resolveCustomSsoSubjectProjection({
      resolve: async () => {
        throw error;
      },
    }, {
      subjectIdentifier,
      clientCode: "client-a",
      selection: { catalogVersion: 2, optionalClaims: [] },
    }));

    expect(result).toBe(error);
  });

  test("owns one strict runtime schema for every Custom SSO V2 consumer", async () => {
    const wire = await resolveWire({
      subjectIdentifier,
      username: "zhangsan",
    });

    expect(CustomSsoSubjectProjectionSchema.safeParse(wire).success).toBe(true);
    expect(() => CustomSsoSubjectProjectionSchema.parse({
      ...wire,
      databaseUserId: 1001,
    })).toThrow();
  });

  test("accepts an omitted profile parent and rejects an empty profile parent", () => {
    const wire = {
      version: 2 as const,
      subjectIdentifier,
    };

    expect(CustomSsoSubjectProjectionSchema.safeParse(wire).success).toBe(true);
    expect(CustomSsoSubjectProjectionSchema.safeParse({
      ...wire,
      profile: {},
    }).success).toBe(false);
  });

  test("maps the mandatory Subject Identifier into the versioned wire contract", async () => {
    const wire = await resolveWire({
      subjectIdentifier,
    });

    expect(wire).toEqual({
      version: 2,
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
        version: 2,
        subjectIdentifier,
        profile: {
          username: "zhangsan",
          name: "张三",
        },
      },
      {
        version: 2,
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
      version: 2,
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
    const scalarPreview = buildCustomSsoPlaceholderPreview([
      SubjectClaim.SubjectIdentifier,
      SubjectClaim.ProfileUsername,
    ]);
    const arrayPreview = buildCustomSsoPlaceholderPreview([
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
      employments: [{ ...employment, responsibilities: [] }],
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
      version: 2,
      subjectIdentifier,
      profile: {
        username: "zhangsan",
        name: "张三",
        phone: "13800000000",
        employments: [{ ...wireEmployment, responsibilities: [] }],
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

async function resolveWire(projection: ClientSubjectProjection) {
  return await resolveCustomSsoSubjectProjection({ resolve: async () => projection }, {
    subjectIdentifier,
    clientCode: "client-a",
    selection: { catalogVersion: 2, optionalClaims: [] },
  });
}

async function captureRejection(promise: Promise<unknown>) {
  try {
    await promise;
  }
  catch (error) {
    return error;
  }
  throw new Error("Expected operation to reject");
}
