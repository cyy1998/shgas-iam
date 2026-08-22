import type {
  ClientSubjectProjection,
  EmploymentResponsibilitySnapshot,
} from "@iam/client-subject-projection";
import {
  CustomSsoSubjectProjectionInvariantError,
  CustomSsoSubjectProjectionSchema,
  resolveCustomSsoSubjectProjection,
} from "@iam/client-subject-projection/custom-sso";
import {
  OrganizationResponsibilityTypeCode,
  OrganizationType,
} from "@iam/contracts";
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
    const result = resolveCustomSsoSubjectProjection({
      // @ts-expect-error exercises the runtime boundary beyond static types
      resolve: async () => invalidProjection,
    }, {
      subjectIdentifier,
      clientCode: "client-a",
      selection: {
        catalogVersion: 2,
        optionalClaims: ["profile:employments"],
      },
    });

    await expect(result).rejects.toEqual(
      new CustomSsoSubjectProjectionInvariantError("invalid_wire"),
    );
    await expect(result).rejects.not.toHaveProperty("cause");
    await expect(result).rejects.not.toHaveProperty("wire");
  });
});
