import type { DbClient } from "@iam/db";
import { OrganizationResponsibilityTypeCode } from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { createOrganizationResponsibilityResolver } from "../../src/index.ts";

function createInaccessibleDb(): DbClient {
  return new Proxy({}, {
    get() {
      throw new Error("empty input must not access the database");
    },
  }) as DbClient;
}

describe("organization responsibility resolver", () => {
  test("returns an empty employment map without querying for empty input", async () => {
    const resolver = createOrganizationResponsibilityResolver(createInaccessibleDb());

    const result = await resolver.resolveEffectiveResponsibilities({
      employmentIds: [],
      at: new Date("2026-08-20T00:00:00.000Z"),
    });

    expect(result).toEqual(new Map());
  });

  test("returns no holder employments without querying for empty target input", async () => {
    const resolver = createOrganizationResponsibilityResolver(createInaccessibleDb());

    await expect(resolver.resolveHolderEmploymentIds({
      targetOrganizationIds: [],
      typeCodes: [OrganizationResponsibilityTypeCode.Head],
      at: new Date("2026-08-20T00:00:00.000Z"),
    })).resolves.toEqual([]);
  });

  test("returns no catalog holders without querying for empty Type input", async () => {
    const resolver = createOrganizationResponsibilityResolver(createInaccessibleDb());

    await expect(resolver.resolveHolderEmploymentIdsByTypes({
      typeCodes: [],
      at: new Date("2026-08-20T00:00:00.000Z"),
    })).resolves.toEqual([]);
  });
});
