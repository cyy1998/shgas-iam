import {
  OrganizationResponsibilityTypeCode,
  OrganizationType,
} from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import {
  InternalUserProfileFilterDslSchema,
} from "../internal-user-query.schema";

describe("Internal User Profile DSL", () => {
  test("models User to Employment to Responsibility scopes without merging sibling responsibilities", () => {
    const parsed = InternalUserProfileFilterDslSchema.parse({
      nested: "employments",
      where: {
        all: [
          {
            nested: "responsibilities",
            where: {
              all: [
                {
                  field: "responsibility.type.code",
                  op: "in",
                  value: [
                    OrganizationResponsibilityTypeCode.Head,
                    OrganizationResponsibilityTypeCode.Head,
                  ],
                },
                {
                  field: "responsibility.targetOrganization.code",
                  op: "withinSubtreeOf",
                  value: "TARGET-ROOT",
                },
              ],
            },
          },
          {
            nested: "responsibilities",
            where: {
              field: "responsibility.targetOrganization.type",
              op: "eq",
              value: OrganizationType.Department,
            },
          },
        ],
      },
    });

    expect(parsed).toEqual({
      nested: "employments",
      where: {
        all: [
          {
            nested: "responsibilities",
            where: {
              all: [
                {
                  field: "responsibility.type.code",
                  op: "in",
                  value: [OrganizationResponsibilityTypeCode.Head],
                },
                {
                  field: "responsibility.targetOrganization.code",
                  op: "withinSubtreeOf",
                  value: "TARGET-ROOT",
                },
              ],
            },
          },
          {
            nested: "responsibilities",
            where: {
              field: "responsibility.targetOrganization.type",
              op: "eq",
              value: OrganizationType.Department,
            },
          },
        ],
      },
    });
  });

  test("rejects unknown vocabulary, empty collections, and values outside fixed budgets", () => {
    const invalidFilters: unknown[] = [
      { all: [] },
      {
        nested: "responsibilities",
        where: responsibilityType("head"),
      },
      {
        nested: "employments",
        where: {
          nested: "responsibilities",
          where: {
            field: "responsibility.type.name",
            op: "eq",
            value: "负责人",
          },
        },
      },
      {
        nested: "employments",
        where: {
          nested: "responsibilities",
          where: responsibilityType("unknown"),
        },
      },
      filterWithTargetCodes([]),
      filterWithTargetCodes(Array.from({ length: 51 }, (_, index) => `ORG-${index}`)),
      filterWithTargetCode("X".repeat(129)),
      filterWithTooManyChildren(),
      filterWithTooManyNodes(),
      filterWithTooMuchDepth(),
      filterWithExtremeDepth(),
    ];

    for (const filter of invalidFilters)
      expect(InternalUserProfileFilterDslSchema.safeParse(filter).success).toBe(false);
  });
});

function responsibilityType(value: string) {
  return {
    field: "responsibility.type.code",
    op: "eq",
    value,
  };
}

function filterWithTargetCodes(value: string[]) {
  return {
    nested: "employments",
    where: {
      nested: "responsibilities",
      where: {
        field: "responsibility.targetOrganization.code",
        op: "in",
        value,
      },
    },
  };
}

function filterWithTargetCode(value: string) {
  return {
    nested: "employments",
    where: {
      nested: "responsibilities",
      where: {
        field: "responsibility.targetOrganization.code",
        op: "eq",
        value,
      },
    },
  };
}

function filterWithTooManyChildren() {
  return {
    all: Array.from({ length: 17 }, () => filterWithTargetCode("TARGET")),
  };
}

function filterWithTooManyNodes() {
  return {
    all: Array.from({ length: 16 }, () => ({
      nested: "employments",
      where: {
        all: Array.from({ length: 16 }, () => ({
          nested: "responsibilities",
          where: responsibilityType("head"),
        })),
      },
    })),
  };
}

function filterWithTooMuchDepth(): unknown {
  let filter: unknown = filterWithTargetCode("TARGET");
  for (let index = 0; index < 6; index += 1)
    filter = { not: filter };
  return filter;
}

function filterWithExtremeDepth(): unknown {
  let filter: unknown = filterWithTargetCode("TARGET");
  for (let index = 0; index < 10_000; index += 1)
    filter = { not: filter };
  return filter;
}
