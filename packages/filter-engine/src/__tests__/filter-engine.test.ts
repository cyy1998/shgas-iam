import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  createDocumentSchema,
  createFilterEngine,
  FilterValidationError,
  searchCollection,
  searchObject,
  searchScalar,
} from "../index";

test("a caller-defined document supplies its own typed paths and strict document schema", () => {
  const structure = searchObject({
    record: searchObject({
      label: searchScalar(z.string(), z.string().max(128)),
      rank: searchScalar(z.number().int(), z.number().int()),
    }),
  });
  const engine = createFilterEngine(structure);
  expect(engine.filterSchema.parse({ field: "record.rank", op: "in", value: [2, 2, 3] })).toEqual({
    field: "record.rank",
    op: "in",
    value: [2, 3],
  });
  expect(() => engine.compile({ field: "record.rank", op: "eq", value: "2" }, sql`document`)).toThrow(
    FilterValidationError,
  );
  expect(() => engine.compile({ field: "user.name", op: "eq", value: "Alice" }, sql`document`)).toThrow(
    FilterValidationError,
  );
  const documentSchema = createDocumentSchema(structure);
  expect(documentSchema.parse({ record: { label: "two", rank: 2 } })).toEqual({ record: { label: "two", rank: 2 } });
  expect(documentSchema.safeParse({ record: { label: "two", rank: 2, internalId: 4 } }).success).toBe(false);
});

test("caller-defined collections expose relative conditions within an exists scope", () => {
  const engine = createFilterEngine(
    searchObject({
      entries: searchCollection({
        code: searchScalar(z.string(), z.string()),
        active: searchScalar(z.boolean(), z.boolean()),
      }),
    }),
  );
  const filter = {
    exists: {
      path: "entries",
      where: {
        and: [
          { field: "code", op: "eq", value: "A" },
          { field: "active", op: "eq", value: true },
        ],
      },
    },
  } satisfies z.infer<typeof engine.filterSchema>;
  expect(engine.filterSchema.parse(filter)).toEqual(filter);
  expect(engine.filterSchema.safeParse({ field: "entries.code", op: "eq", value: "A" }).success).toBe(false);
  expect(
    engine.filterSchema.safeParse({
      exists: { path: "entries", where: { field: "entries.code", op: "eq", value: "A" } },
    }).success,
  ).toBe(false);
});
