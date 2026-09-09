import type { SubjectFactsSnapshot } from "@iam/client-subject-projection";
import {
  createPermittedClientSubjectProjectionService,
  InvalidSubjectClaimSelectionError,
  parseSubjectClaimSelection,
  SUBJECT_CLAIM_CATALOG,
  SubjectProjectionNotReadyError,
} from "@iam/client-subject-projection";
import {
  OrganizationResponsibilityTypeCode,
  OrganizationType,
} from "@iam/contracts";
import { describe, expect, test } from "bun:test";

const subjectIdentifier = "00000000-0000-4000-8000-000000000001";

describe("Client Subject Projection Interface", () => {
  function createService(options: Omit<Parameters<typeof createPermittedClientSubjectProjectionService>[0], "assertPermission">) {
    const permission = {};
    const service = createPermittedClientSubjectProjectionService({
      subjectFacts: options.subjectFacts,
      assertPermission: (value: object, subject: string) => {
        if (value !== permission || subject !== subjectIdentifier)
          throw new Error("Permission required");
      },
    });
    return { resolve: (input: Parameters<typeof service.resolve>[0]) => service.resolve(input, permission) };
  }

  test("publishes a closed V2 Catalog without a responsibility-only claim", () => {
    expect(SUBJECT_CLAIM_CATALOG).toEqual({
      version: 2,
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

    expect(parseSubjectClaimSelection({
      catalogVersion: 2,
      claims: ["subjectIdentifier", "profile:employments"],
    })).toEqual({
      catalogVersion: 2,
      optionalClaims: ["profile:employments"],
    });
    expect(() => parseSubjectClaimSelection({
      catalogVersion: 1,
      claims: ["subjectIdentifier"],
    })).toThrow();
    expect(() => parseSubjectClaimSelection({
      catalogVersion: 2,
      claims: ["subjectIdentifier", "profile:responsibilities"],
    })).toThrow();
  });

  test("projects canonical responsibilities only inside selected profile employments", async () => {
    const subjectIdentifier = "00000000-0000-4000-8000-000000000001";
    const service = createService({
      subjectFacts: {
        read: async () => ({
          subjectIdentifier,
          sourceDirtyVersion: "7",
          profile: {
            username: "zhangsan",
            name: "张三",
            phone: null,
          },
          employments: [
            {
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
              clientAuthorizations: [{
                clientCode: "client-a",
                roles: [{ code: "admin", privileges: ["read"] }],
              }],
              responsibilities: [{
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
                    { code: "target-a", name: "目标甲", type: OrganizationType.Department },
                  ],
                },
              }],
            },
            {
              isPrimary: false,
              organization: {
                code: "org-b",
                name: "乙部门",
                type: OrganizationType.Department,
                path: [
                  { code: "root", name: "总部", type: OrganizationType.Company },
                  { code: "org-b", name: "乙部门", type: OrganizationType.Department },
                ],
              },
              position: { code: "position-b", name: "乙岗位" },
              clientAuthorizations: [],
              responsibilities: [],
            },
          ],
        }),
      },
    });

    const projection = await service.resolve({
      subjectIdentifier,
      clientCode: "client-a",
      selection: {
        catalogVersion: 2,
        optionalClaims: ["profile:employments", "iam:authorization"],
      },
    });

    expect(projection.employments?.map(employment => employment.responsibilities))
      .toEqual([
        [{
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
              { code: "target-a", name: "目标甲", type: OrganizationType.Department },
            ],
          },
        }],
        [],
      ]);
    for (const employment of projection.authorization?.employments ?? [])
      expect(employment).not.toHaveProperty("responsibilities");
  });

  test("normalizes a Catalog V2 declaration into optional claim Selection", () => {
    const selection = parseSubjectClaimSelection({
      catalogVersion: 2,
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
      catalogVersion: 2,
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
        catalogVersion: 99,
        claims: ["subjectIdentifier"],
      },
      {
        catalogVersion: 2,
        claims: ["subjectIdentifier", "profile:unknown"],
      },
      {
        catalogVersion: 2,
        claims: ["subjectIdentifier", "profile:name", "profile:name"],
      },
      {
        catalogVersion: 2,
        claims: ["profile:name"],
      },
      {
        catalogVersion: 2,
        claims: ["subjectIdentifier", "username"],
      },
      {
        catalogVersion: 2,
        claims: ["subjectIdentifier", "id"],
      },
      {
        catalogVersion: 2,
        claims: ["subjectIdentifier", "$.profile.name"],
      },
      {
        catalogVersion: 2,
        claims: ["subjectIdentifier", "favoriteColor"],
      },
    ];

    for (const declaration of invalidDeclarations) {
      expect(() => parseSubjectClaimSelection(declaration))
        .toThrow(InvalidSubjectClaimSelectionError);
    }
  });

  test("fails closed when an untyped caller bypasses normalized Selection construction", async () => {
    const service = createService({
      subjectFacts: {
        read: async () => null,
      },
    });
    const invalidSelections = [
      {
        catalogVersion: 99,
        optionalClaims: [],
      },
      {
        catalogVersion: 2,
        optionalClaims: ["profile:unknown"],
      },
      {
        catalogVersion: 2,
        optionalClaims: ["profile:name", "profile:name"],
      },
      {
        catalogVersion: 2,
        optionalClaims: ["subjectIdentifier"],
      },
    ];

    for (const selection of invalidSelections) {
      const result = Reflect.apply(service.resolve, undefined, [{
        subjectIdentifier,
        clientCode: "client-a",
        selection,
      }]);
      const failure = await captureRejection(result);
      expect(failure).toBeInstanceOf(InvalidSubjectClaimSelectionError);
    }
  });

  test("resolves the mandatory Subject Identifier without requiring Subject Facts", async () => {
    let factsReads = 0;
    const service = createService({
      subjectFacts: {
        read: async () => {
          factsReads += 1;
          return null;
        },
      },
    });

    const projection = await service.resolve({
      subjectIdentifier,
      clientCode: "client-a",
      selection: {
        catalogVersion: 2,
        optionalClaims: [],
      },
    });

    expect(projection).toEqual({ subjectIdentifier });
    expect(factsReads).toBe(0);
  });

  test("returns only selected scalar profile claims", async () => {
    const service = createService({
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
    });

    const projection = await service.resolve({
      subjectIdentifier,
      clientCode: "client-a",
      selection: {
        catalogVersion: 2,
        optionalClaims: ["profile:username"],
      },
    });

    expect(projection).toEqual({
      subjectIdentifier,
      username: "zhangsan",
    });
  });

  test("preserves a selected nullable phone as a protocol-neutral fact", async () => {
    const service = createService({
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
    });

    const projection = await service.resolve({
      subjectIdentifier,
      clientCode: "client-a",
      selection: {
        catalogVersion: 2,
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
    const service = createService({
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
              responsibilities: [],
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
              responsibilities: [],
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
              responsibilities: [],
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
    });

    const projection = await service.resolve({
      subjectIdentifier,
      clientCode: "client-a",
      selection: {
        catalogVersion: 2,
        optionalClaims: ["profile:employments"],
      },
    });

    expect(projection).toEqual({
      subjectIdentifier,
      employments: [
        {
          responsibilities: [],
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
          responsibilities: [],
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
          responsibilities: [],
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
          responsibilities: [],
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
          responsibilities: [],
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
    const service = createService({
      subjectFacts: { read: async () => facts },
    });
    const selection = {
      catalogVersion: 2,
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

  test("assembles each projection from the published facts read for that call", async () => {
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
        responsibilities: [],
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
        responsibilities: [],
        clientAuthorizations: [{
          clientCode: "client-a",
          roles: [{ code: "new-role", privileges: ["new-privilege"] }],
        }],
      }],
    } satisfies SubjectFactsSnapshot;
    let publishedFacts = observedFacts;
    const service = createService({
      subjectFacts: {
        read: async () => publishedFacts,
      },
    });

    const projection = await service.resolve({
      subjectIdentifier,
      clientCode: "client-a",
      selection: {
        catalogVersion: 2,
        optionalClaims: ["profile:name", "iam:authorization"],
      },
    });

    expect(projection).toMatchObject({
      name: "旧姓名",
      authorization: { roles: ["old-role"], privileges: ["old-privilege"] },
    });
    publishedFacts = refreshedFacts;
    const nextProjection = await service.resolve({
      subjectIdentifier,
      clientCode: "client-a",
      selection: { catalogVersion: 2, optionalClaims: ["profile:name", "iam:authorization"] },
    });

    expect(nextProjection).toEqual({
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
});

describe("Projection access proof", () => {
  const input = {
    subjectIdentifier,
    clientCode: "client-a",
    selection: { catalogVersion: 2, optionalClaims: [] },
  } as const;

  test("requires proof before facts, selection validation or identity-only delivery", async () => {
    const permission = {};
    const denied = new Error("Permission required");
    const calls: string[] = [];
    const service = createPermittedClientSubjectProjectionService({
      assertPermission: (value: object, subject: string) => {
        calls.push("permission");
        if (value !== permission || subject !== subjectIdentifier)
          throw denied;
      },
      subjectFacts: { read: async () => {
        calls.push("facts");
        return null;
      } },
    });
    for (const candidate of [input, { ...input, selection: { catalogVersion: 99, optionalClaims: [] } }]) {
      const failure = await captureRejection(Reflect.apply(service.resolve, undefined, [candidate]));
      expect(failure).toBe(denied);
    }
    const wrongProof = await captureRejection(service.resolve(input, {}));
    expect(wrongProof).toBe(denied);
    const wrongSubject = await captureRejection(service.resolve({ ...input, subjectIdentifier: "other" }, permission));
    expect(wrongSubject).toBe(denied);
    const projection = await service.resolve(input, permission);
    expect(projection).toEqual({ subjectIdentifier });
    expect(calls).toEqual(["permission", "permission", "permission", "permission", "permission"]);
  });

  test.each([null, "other"])("rejects absent or mismatched facts (%s) after permission", async (subject) => {
    const permission = {};
    const calls: string[] = [];
    const service = createPermittedClientSubjectProjectionService({
      assertPermission: (value: object) => {
        if (value !== permission)
          throw new Error("Permission required");
        calls.push("permission");
      },
      subjectFacts: {
        read: async () => {
          calls.push("facts");
          return subject === null
            ? null
            : {
                subjectIdentifier: subject,
                sourceDirtyVersion: "1",
                profile: { username: "user", name: "Name", phone: null },
                employments: [],
              };
        },
      },
    });
    const failure = await captureRejection(service.resolve({
      ...input,
      selection: { catalogVersion: 2, optionalClaims: ["iam:authorization"] },
    }, permission));
    expect(failure).toBeInstanceOf(SubjectProjectionNotReadyError);
    expect(calls).toEqual(["permission", "facts"]);
  });
});

async function captureRejection(promise: Promise<unknown>) {
  try {
    await promise;
  }
  catch (error) {
    return error;
  }
  throw new Error("Expected operation to reject");
}
