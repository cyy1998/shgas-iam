import { ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG } from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { OrganizationResponsibilityTypeViewSchema } from "../schema";

describe("Organization Responsibility Type View", () => {
  test("accepts the canonical Catalog and rejects runtime management fields", () => {
    expect(
      ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map(entry => (
        OrganizationResponsibilityTypeViewSchema.parse(entry)
      )),
    ).toEqual([...ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG]);

    expect(() => OrganizationResponsibilityTypeViewSchema.parse({
      ...ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG[0],
      status: "Enable",
    })).toThrow();
  });
});
