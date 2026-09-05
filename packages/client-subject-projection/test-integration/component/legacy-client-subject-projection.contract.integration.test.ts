import type { SubjectFactsSnapshot } from "../../src/legacy/legacy-maintenance";
import { describe, expect, test } from "bun:test";
import {
  createClientSubjectProjectionService,
  InvalidSubjectClaimSelectionError,
  parseSubjectClaimSelection,
  SUBJECT_CLAIM_CATALOG_V1,
  SubjectProjectionNotReadyError,
} from "../../src/legacy/legacy-maintenance";
import { createInMemoryClientSubjectProjectionService } from "../../src/testing/testing";

const subjectIdentifier = "00000000-0000-4000-8000-000000000001";

describe("Legacy Client Subject Projection V1 Interface", () => {
  test("publishes the closed Catalog V1 vocabulary", () => {
    expect(SUBJECT_CLAIM_CATALOG_V1).toEqual({
      version: 1,
      claims: [
        {
          claim: "subjectIdentifier",
          group: "identity",
          required: true,
          wirePath: "subjectIdentifier",
        },
        {
          claim: "profile:username",
          group: "profile",
          required: false,
          wirePath: "profile.username",
        },
        {
          claim: "profile:name",
          group: "profile",
          required: false,
          wirePath: "profile.name",
        },
        {
          claim: "profile:phone",
          group: "profile",
          required: false,
          wirePath: "profile.phone",
        },
        {
          claim: "profile:employments",
          group: "profile",
          required: false,
          wirePath: "profile.employments",
        },
        {
          claim: "iam:authorization",
          group: "authorization",
          required: false,
          wirePath: "authorization",
        },
      ],
      requiredClaims: ["subjectIdentifier"],
      optionalClaims: [
        "profile:username",
        "profile:name",
        "profile:phone",
        "profile:employments",
        "iam:authorization",
      ],
    });
  });

  test("offers a pure in-memory adapter through the same public Interface", async () => {
    const service = createInMemoryClientSubjectProjectionService({
      subjects: [{ subjectIdentifier }],
    });

    const projection = await service.resolve({
      subjectIdentifier,
      clientCode: "client-a",
      selection: {
        catalogVersion: 1,
        optionalClaims: [],
      },
    });

    expect(projection).toEqual({ subjectIdentifier });
  });

  test("normalizes a Catalog V1 declaration into optional claim Selection", () => {
    const selection = parseSubjectClaimSelection({
      catalogVersion: 1,
      claims: [
        "subjectIdentifier",
        "profile:username",
        "profile:name",
        "profile:phone",
        "profile:employments",
        "iam:authorization",
      ],
    });

    expect(selection).toEqual({
      catalogVersion: 1,
      optionalClaims: [
        "profile:username",
        "profile:name",
        "profile:phone",
        "profile:employments",
        "iam:authorization",
      ],
    });
  });

  test("fails closed for unsupported or ambiguous Catalog declarations", () => {
    const invalidDeclarations = [
      {
        catalogVersion: 2,
        claims: ["subjectIdentifier"],
      },
      {
        catalogVersion: 1,
        claims: ["subjectIdentifier", "profile:unknown"],
      },
      {
        catalogVersion: 1,
        claims: ["subjectIdentifier", "profile:name", "profile:name"],
      },
      {
        catalogVersion: 1,
        claims: ["profile:name"],
      },
      {
        catalogVersion: 1,
        claims: ["subjectIdentifier", "username"],
      },
      {
        catalogVersion: 1,
        claims: ["subjectIdentifier", "id"],
      },
      {
        catalogVersion: 1,
        claims: ["subjectIdentifier", "$.profile.name"],
      },
      {
        catalogVersion: 1,
        claims: ["subjectIdentifier", "favoriteColor"],
      },
    ];

    for (const declaration of invalidDeclarations) {
      expect(() => parseSubjectClaimSelection(declaration))
        .toThrow(InvalidSubjectClaimSelectionError);
    }
  });

  test("fails closed when an untyped caller bypasses normalized Selection construction", async () => {
    const service = createClientSubjectProjectionService({
      subjectAccess: {
        assertAccessible: async () => {},
      },
      subjectFacts: {
        read: async () => null,
      },
      authorizationFreshness: {
        check: async () => {
          throw new Error("Profile claims must allow last published Subject Facts");
        },
      },
    });
    const invalidSelections = [
      {
        catalogVersion: 2,
        optionalClaims: [],
      },
      {
        catalogVersion: 1,
        optionalClaims: ["profile:unknown"],
      },
      {
        catalogVersion: 1,
        optionalClaims: ["profile:name", "profile:name"],
      },
      {
        catalogVersion: 1,
        optionalClaims: ["subjectIdentifier"],
      },
    ];

    for (const selection of invalidSelections) {
      const result = Reflect.apply(service.resolve, undefined, [{
        subjectIdentifier,
        clientCode: "client-a",
        selection,
      }]);
      await expect(result).rejects.toBeInstanceOf(InvalidSubjectClaimSelectionError);
    }
  });

  test("resolves the mandatory Subject Identifier without requiring Subject Facts", async () => {
    let factsReads = 0;
    let dirtyReads = 0;
    const service = createClientSubjectProjectionService({
      subjectAccess: {
        assertAccessible: async () => {},
      },
      subjectFacts: {
        read: async () => {
          factsReads += 1;
          return null;
        },
      },
      authorizationFreshness: {
        check: async () => {
          dirtyReads += 1;
          return { status: "not-ready" };
        },
      },
    });

    const projection = await service.resolve({
      subjectIdentifier,
      clientCode: "client-a",
      selection: {
        catalogVersion: 1,
        optionalClaims: [],
      },
    });

    expect(projection).toEqual({ subjectIdentifier });
    expect({ factsReads, dirtyReads }).toEqual({
      factsReads: 0,
      dirtyReads: 0,
    });
  });

  test("returns only selected scalar profile claims", async () => {
    const service = createClientSubjectProjectionService({
      subjectAccess: {
        assertAccessible: async () => {},
      },
      subjectFacts: {
        read: async () => ({
          subjectIdentifier,
          sourceDirtyVersion: "7",
          profile: {
            username: "zhangsan",
            name: "张三",
            phone: "13800000000",
          },
          employments: [],
        }),
      },
      authorizationFreshness: {
        check: async () => {
          throw new Error("Profile claims must allow last published Subject Facts");
        },
      },
    });

    const projection = await service.resolve({
      subjectIdentifier,
      clientCode: "client-a",
      selection: {
        catalogVersion: 1,
        optionalClaims: ["profile:username"],
      },
    });

    expect(projection).toEqual({
      subjectIdentifier,
      username: "zhangsan",
    });
  });

  test("preserves a selected nullable phone as a protocol-neutral fact", async () => {
    const service = createClientSubjectProjectionService({
      subjectAccess: {
        assertAccessible: async () => {},
      },
      subjectFacts: {
        read: async () => ({
          subjectIdentifier,
          sourceDirtyVersion: "7",
          profile: {
            username: "zhangsan",
            name: "张三",
            phone: null,
          },
          employments: [],
        }),
      },
      authorizationFreshness: {
        check: async () => {
          throw new Error("Profile claims must allow last published Subject Facts");
        },
      },
    });

    const projection = await service.resolve({
      subjectIdentifier,
      clientCode: "client-a",
      selection: {
        catalogVersion: 1,
        optionalClaims: ["profile:name", "profile:phone"],
      },
    });

    expect(projection).toEqual({
      subjectIdentifier,
      name: "张三",
      phone: null,
    });
  });

  test("sorts Employment Profiles and ignores fields outside the narrow Facts contract", async () => {
    const rootOrganization = {
      code: "root",
      name: "总部",
      type: "company",
    };
    const service = createClientSubjectProjectionService({
      subjectAccess: {
        assertAccessible: async () => {},
      },
      subjectFacts: {
        read: async () => ({
          subjectIdentifier,
          sourceDirtyVersion: "7",
          profile: {
            username: "zhangsan",
            name: "张三",
            phone: "13800000000",
          },
          employments: [
            {
              id: 102,
              status: 1,
              isDelete: false,
              isPrimary: false,
              organization: {
                code: "org-b",
                name: "乙部门",
                type: "department",
                path: [rootOrganization, {
                  code: "org-b",
                  name: "乙部门",
                  type: "department",
                }],
              },
              position: {
                code: "position-b",
                name: "乙岗位",
                description: "must not leave the facts seam",
              },
              clientAuthorizations: [],
            },
            {
              id: 101,
              status: 1,
              isDelete: false,
              isPrimary: true,
              organization: {
                code: "org-z",
                name: "主任职部门",
                type: "department",
                path: [rootOrganization, {
                  code: "org-z",
                  name: "主任职部门",
                  type: "department",
                }],
              },
              position: {
                code: "position-z",
                name: "主任职岗位",
              },
              clientAuthorizations: [],
            },
            {
              id: 103,
              status: 1,
              isDelete: false,
              isPrimary: false,
              organization: {
                code: "org-a",
                name: "甲部门",
                type: "department",
                path: [rootOrganization, {
                  code: "org-a",
                  name: "甲部门",
                  type: "department",
                }],
              },
              position: {
                code: "position-a",
                name: "甲岗位",
              },
              clientAuthorizations: [],
            },
          ],
          futureLegacyDetailField: "must not enter the projection",
          wxId: "must-not-leak",
          userType: "must-not-leak",
          userStatus: 1,
          orderNum: 1,
          description: "must-not-leak",
          isDelete: false,
          createTime: "must-not-leak",
          updateTime: "must-not-leak",
          orcasId: "must-not-leak",
        }),
      },
      authorizationFreshness: {
        check: async () => {
          throw new Error("Profile claims must allow last published Subject Facts");
        },
      },
    });

    const projection = await service.resolve({
      subjectIdentifier,
      clientCode: "client-a",
      selection: {
        catalogVersion: 1,
        optionalClaims: ["profile:employments"],
      },
    });

    expect(projection).toEqual({
      subjectIdentifier,
      employments: [
        {
          isPrimary: true,
          organization: {
            code: "org-z",
            name: "主任职部门",
            type: "department",
            path: [
              rootOrganization,
              { code: "org-z", name: "主任职部门", type: "department" },
            ],
          },
          position: {
            code: "position-z",
            name: "主任职岗位",
          },
        },
        {
          isPrimary: false,
          organization: {
            code: "org-a",
            name: "甲部门",
            type: "department",
            path: [
              rootOrganization,
              { code: "org-a", name: "甲部门", type: "department" },
            ],
          },
          position: {
            code: "position-a",
            name: "甲岗位",
          },
        },
        {
          isPrimary: false,
          organization: {
            code: "org-b",
            name: "乙部门",
            type: "department",
            path: [
              rootOrganization,
              { code: "org-b", name: "乙部门", type: "department" },
            ],
          },
          position: {
            code: "position-b",
            name: "乙岗位",
          },
        },
      ],
    });
  });

  test("crops authorization to each client and retains employments without roles", async () => {
    const facts = {
      subjectIdentifier,
      sourceDirtyVersion: "11",
      profile: {
        username: "zhangsan",
        name: "张三",
        phone: null,
      },
      employments: [
        {
          isPrimary: false,
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
          clientAuthorizations: [
            {
              clientCode: "client-b",
              roles: [
                {
                  code: "operator",
                  privileges: ["read", "execute", "execute"],
                },
              ],
            },
          ],
        },
        {
          isPrimary: true,
          organization: {
            code: "org-z",
            name: "主任职部门",
            type: "department",
            path: [
              { code: "root", name: "总部", type: "company" },
              { code: "org-z", name: "主任职部门", type: "department" },
            ],
          },
          position: {
            code: "position-z",
            name: "主任职岗位",
          },
          clientAuthorizations: [
            {
              clientCode: "client-a",
              roles: [
                {
                  code: "viewer",
                  privileges: ["read", "read"],
                },
                {
                  code: "admin",
                  privileges: ["write", "read"],
                },
                {
                  code: "viewer",
                  privileges: ["read"],
                },
              ],
            },
            {
              clientCode: "client-b",
              roles: [
                {
                  code: "auditor",
                  privileges: ["audit", "audit"],
                },
              ],
            },
          ],
        },
      ],
    } satisfies SubjectFactsSnapshot;
    const service = createInMemoryClientSubjectProjectionService({
      subjects: [{
        subjectIdentifier,
        facts,
        freshAuthorizationSourceDirtyVersion: "11",
      }],
    });
    const selection = {
      catalogVersion: 1,
      optionalClaims: ["iam:authorization"],
    } as const;

    const [clientA, clientB] = await Promise.all([
      service.resolve({ subjectIdentifier, clientCode: "client-a", selection }),
      service.resolve({ subjectIdentifier, clientCode: "client-b", selection }),
    ]);

    const primaryEmployment = {
      isPrimary: true,
      organization: {
        code: "org-z",
        name: "主任职部门",
        type: "department",
        path: [
          { code: "root", name: "总部", type: "company" },
          { code: "org-z", name: "主任职部门", type: "department" },
        ],
      },
      position: {
        code: "position-z",
        name: "主任职岗位",
      },
    };
    const secondaryEmployment = {
      isPrimary: false,
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

    expect([clientA, clientB]).toEqual([
      {
        subjectIdentifier,
        authorization: {
          employments: [
            {
              ...primaryEmployment,
              roles: ["admin", "viewer"],
              privileges: ["read", "write"],
            },
            {
              ...secondaryEmployment,
              roles: [],
              privileges: [],
            },
          ],
          roles: ["admin", "viewer"],
          privileges: ["read", "write"],
        },
      },
      {
        subjectIdentifier,
        authorization: {
          employments: [
            {
              ...primaryEmployment,
              roles: ["auditor"],
              privileges: ["audit"],
            },
            {
              ...secondaryEmployment,
              roles: ["operator"],
              privileges: ["execute", "read"],
            },
          ],
          roles: ["auditor", "operator"],
          privileges: ["audit", "execute", "read"],
        },
      },
    ]);
  });

  test("assembles all selected claims from facts refreshed by the freshness barrier", async () => {
    const employment = {
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
    const observedFacts = {
      subjectIdentifier,
      sourceDirtyVersion: "12",
      profile: {
        username: "zhangsan",
        name: "旧姓名",
        phone: null,
      },
      employments: [{
        ...employment,
        clientAuthorizations: [{
          clientCode: "client-a",
          roles: [{ code: "old-role", privileges: ["old-privilege"] }],
        }],
      }],
    } satisfies SubjectFactsSnapshot;
    const refreshedFacts = {
      subjectIdentifier,
      sourceDirtyVersion: "13",
      profile: {
        username: "zhangsan",
        name: "新姓名",
        phone: null,
      },
      employments: [{
        ...employment,
        clientAuthorizations: [{
          clientCode: "client-a",
          roles: [{ code: "new-role", privileges: ["new-privilege"] }],
        }],
      }],
    } satisfies SubjectFactsSnapshot;
    const service = createClientSubjectProjectionService({
      subjectAccess: {
        assertAccessible: async () => {},
      },
      subjectFacts: {
        read: async () => observedFacts,
      },
      authorizationFreshness: {
        check: async () => ({
          status: "refreshed",
          facts: refreshedFacts,
        }),
      },
    });

    const projection = await service.resolve({
      subjectIdentifier,
      clientCode: "client-a",
      selection: {
        catalogVersion: 1,
        optionalClaims: ["profile:name", "iam:authorization"],
      },
    });

    expect(projection).toEqual({
      subjectIdentifier,
      name: "新姓名",
      authorization: {
        employments: [{
          ...employment,
          roles: ["new-role"],
          privileges: ["new-privilege"],
        }],
        roles: ["new-role"],
        privileges: ["new-privilege"],
      },
    });
  });

  test("fails the whole authorization projection when freshness cannot be proven", async () => {
    const service = createClientSubjectProjectionService({
      subjectAccess: {
        assertAccessible: async () => {},
      },
      subjectFacts: {
        read: async () => ({
          subjectIdentifier,
          sourceDirtyVersion: "12",
          profile: {
            username: "zhangsan",
            name: "张三",
            phone: null,
          },
          employments: [],
        }),
      },
      authorizationFreshness: {
        check: async () => ({ status: "not-ready" }),
      },
    });

    const result = service.resolve({
      subjectIdentifier,
      clientCode: "client-a",
      selection: {
        catalogVersion: 1,
        optionalClaims: ["iam:authorization"],
      },
    });

    await expect(result).rejects.toBeInstanceOf(SubjectProjectionNotReadyError);
  });
});
