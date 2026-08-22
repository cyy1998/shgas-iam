import {
  createClientSubjectProjectionService,
  parseSubjectClaimSelection,
  SUBJECT_CLAIM_CATALOG,
} from "@iam/client-subject-projection";
import {
  OrganizationResponsibilityTypeCode,
  OrganizationType,
} from "@iam/contracts";
import { describe, expect, test } from "bun:test";

describe("Client Subject Projection Interface", () => {
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
    const service = createClientSubjectProjectionService({
      subjectAccess: { assertAccessible: async () => undefined },
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
      authorizationFreshness: {
        check: async () => ({ status: "fresh" }),
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
});
