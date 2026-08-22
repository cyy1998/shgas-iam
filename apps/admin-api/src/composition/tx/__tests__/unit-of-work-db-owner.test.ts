import type { DbClient } from "@iam/db";
import type { createAdminApiUnitOfWork } from "..";
import { expectTypeOf, test } from "bun:test";

test("requires the composition database as the UnitOfWork transaction owner", () => {
  type Options = Parameters<typeof createAdminApiUnitOfWork>[0];
  expectTypeOf<Options["db"]>().toEqualTypeOf<DbClient>();
});
