import { OrganizationResponsibilityTypeCode } from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { compileInternalUserProfileFilter } from "../internal-user-query.compiler";

const dialect = new PgDialect();

describe("Internal User Profile query compiler", () => {
  test("keeps all conditions in one responsibility nested on the same JSON element", () => {
    const query = compile({
      nested: "employments",
      where: {
        nested: "responsibilities",
        where: {
          all: [
            responsibilityType(OrganizationResponsibilityTypeCode.Head),
            targetCode("TARGET-A"),
          ],
        },
      },
    });

    expect(occurrences(query.sql, "AS candidate_employment(value)")).toBe(1);
    expect(occurrences(query.sql, "AS candidate_responsibility(value)")).toBe(1);
    expect(query.params).toEqual([
      OrganizationResponsibilityTypeCode.Head,
      "TARGET-A",
    ]);
  });

  test("preserves separate responsibility and employment nested scopes", () => {
    const siblingResponsibilities = compile({
      nested: "employments",
      where: {
        all: [
          responsibilityNested(responsibilityType(OrganizationResponsibilityTypeCode.Head)),
          responsibilityNested(targetCode("TARGET-A")),
        ],
      },
    });
    const siblingEmployments = compile({
      all: [
        employmentNested(responsibilityType(OrganizationResponsibilityTypeCode.Head)),
        employmentNested(targetCode("TARGET-A")),
      ],
    });

    expect(occurrences(siblingResponsibilities.sql, "AS candidate_employment(value)")).toBe(1);
    expect(occurrences(siblingResponsibilities.sql, "AS candidate_responsibility(value)")).toBe(2);
    expect(occurrences(siblingEmployments.sql, "AS candidate_employment(value)")).toBe(2);
    expect(occurrences(siblingEmployments.sql, "AS candidate_responsibility(value)")).toBe(2);
  });

  test("compiles inclusive subtree membership against the published target path", () => {
    const query = compile(employmentNested({
      field: "responsibility.targetOrganization.code",
      op: "withinSubtreeOf",
      value: "TARGET-ROOT",
    }));

    expect(query.sql).toContain("#> '{targetOrganization,path}'");
    expect(query.sql).toContain("candidate_target_path.value ->> 'code'");
    expect(query.params).toEqual(["TARGET-ROOT"]);
  });
});

function compile(filter: Parameters<typeof compileInternalUserProfileFilter>[0]) {
  return dialect.sqlToQuery(compileInternalUserProfileFilter(filter).getSQL());
}

function occurrences(value: string, search: string) {
  return value.split(search).length - 1;
}

function employmentNested(
  where: Parameters<typeof responsibilityNested>[0],
) {
  return {
    nested: "employments" as const,
    where: responsibilityNested(where),
  };
}

function responsibilityNested(
  where: ReturnType<typeof responsibilityType> | ReturnType<typeof targetCode> | {
    field: "responsibility.targetOrganization.code";
    op: "withinSubtreeOf";
    value: string;
  },
) {
  return { nested: "responsibilities" as const, where };
}

function responsibilityType(value: OrganizationResponsibilityTypeCode) {
  return {
    field: "responsibility.type.code" as const,
    op: "eq" as const,
    value,
  };
}

function targetCode(value: string) {
  return {
    field: "responsibility.targetOrganization.code" as const,
    op: "eq" as const,
    value,
  };
}
