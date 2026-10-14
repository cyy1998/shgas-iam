import { expect, test } from "bun:test";
import { createFilterTransportSchemas, FILTER_MAX_DEPTH, FILTER_MAX_NODES } from "../index";

const condition = { field: "caller.field", op: "eq", value: " exact " };

test("transport accepts the common strict AST without selecting caller fields or normalizing values", () => {
  const { expressionSchema, budgetedSchema } = createFilterTransportSchemas();
  const filter = {
    and: [condition, { or: [{ not: condition }, { exists: { path: "caller.entries", where: condition } }] }],
  };
  expect(expressionSchema.parse(filter)).toEqual(filter);
  expect(budgetedSchema.parse(filter)).toEqual(filter);
  expect(budgetedSchema.parse({ ...condition, op: "in", value: [" exact ", " exact "] })).toEqual({
    ...condition,
    op: "in",
    value: [" exact ", " exact "],
  });
  for (const invalid of [
    { and: [] },
    { ...condition, extra: true },
    { ...condition, op: "unknown" },
    { ...condition, value: null },
    { ...condition, value: "x".repeat(129) },
    { exists: { path: "caller.entries", where: condition, extra: true } },
  ])
    expect(budgetedSchema.safeParse(invalid).success).toBe(false);
});

test("transport checks shared budgets before walking a deeply recursive schema", () => {
  const { budgetedSchema } = createFilterTransportSchemas();
  let atDepthLimit: unknown = condition;
  for (let depth = 1; depth < FILTER_MAX_DEPTH; depth++) atDepthLimit = { not: atDepthLimit };
  expect(budgetedSchema.parse(atDepthLimit)).toEqual(atDepthLimit);
  let excessivelyDeep: unknown = condition;
  for (let depth = 0; depth < 10_000; depth++) excessivelyDeep = { not: excessivelyDeep };
  const invalidFilters: readonly (readonly [unknown, string])[] = [
    [excessivelyDeep, `Filter depth exceeds ${FILTER_MAX_DEPTH}`],
    [
      { and: Array.from({ length: 8 }, () => ({ and: Array.from({ length: 8 }, () => condition) })) },
      `Filter node count exceeds ${FILTER_MAX_NODES}`,
    ],
    [{ and: Array.from({ length: 17 }, () => condition) }, "Filter and contains more than 16 children"],
    [
      { ...condition, op: "in", value: Array.from({ length: 501 }, () => "value") },
      "Filter value contains more than 500 raw items",
    ],
  ];
  for (const [filter, message] of invalidFilters) {
    const result = budgetedSchema.safeParse(filter);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toEqual([{ code: "custom", message, path: [] }]);
  }
});
