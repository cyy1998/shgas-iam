import {
  buildCustomSsoPlaceholderPreviewV1,
  CustomSsoSubjectProjectionV1Schema,
  mapClientSubjectProjectionToCustomSsoV1,
} from "@iam/client-subject-projection/custom-sso";
import { SubjectClaim } from "@iam/contracts";
import { describe, expect, test } from "bun:test";

const subjectIdentifier = "00000000-0000-4000-8000-000000000001";

describe("Custom SSO V1 subject wire mapping contract", () => {
  test("owns one strict runtime schema for every Custom SSO V1 consumer", () => {
    const wire = mapClientSubjectProjectionToCustomSsoV1({
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

  test("maps the mandatory Subject Identifier into the versioned wire contract", () => {
    const wire = mapClientSubjectProjectionToCustomSsoV1({
      subjectIdentifier,
    });

    expect(wire).toEqual({
      version: 1,
      subjectIdentifier,
    });
  });

  test("nests selected profile scalars while omitting null phone and an empty parent", () => {
    const populated = mapClientSubjectProjectionToCustomSsoV1({
      subjectIdentifier,
      username: "zhangsan",
      name: "张三",
      phone: null,
    });
    const empty = mapClientSubjectProjectionToCustomSsoV1({
      subjectIdentifier,
      phone: null,
    });

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

  test("keeps selected arrays present when their values are empty", () => {
    const wire = mapClientSubjectProjectionToCustomSsoV1({
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

  test("builds the fixed Admin preview through the production mapper", () => {
    const scalarPreview = buildCustomSsoPlaceholderPreviewV1([
      SubjectClaim.SubjectIdentifier,
      SubjectClaim.ProfileUsername,
    ]);
    const arrayPreview = buildCustomSsoPlaceholderPreviewV1([
      SubjectClaim.SubjectIdentifier,
      SubjectClaim.ProfileEmployments,
      SubjectClaim.IamAuthorization,
    ]);

    expect(scalarPreview).toEqual(mapClientSubjectProjectionToCustomSsoV1({
      subjectIdentifier,
      username: "zhangsan",
    }));
    expect(arrayPreview).toEqual(mapClientSubjectProjectionToCustomSsoV1({
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

  test("maps self-contained claims through an explicit wire whitelist without compatibility aliases", () => {
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
    const wire = mapClientSubjectProjectionToCustomSsoV1(projection);

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
