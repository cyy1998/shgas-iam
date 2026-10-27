import { expect, test } from "bun:test";
import { z } from "zod";
import { createFilterEngine, searchStructureFromSchema } from "../index";

test("a public schema supplies scalar and nested collection search paths", () => {
  const organizationSchema = z.object({
    code: z.string(),
    path: z.array(z.object({ code: z.string(), level: z.number().int().positive() })),
  });
  const documentSchema = z.object({
    subjectIdentifier: z.uuid(),
    mobile: z.string().max(20).nullable(),
    active: z.boolean(),
    employments: z.array(z.object({ organization: organizationSchema, roles: z.array(z.string()) })),
  });
  const engine = createFilterEngine(searchStructureFromSchema(documentSchema));

  expect(
    engine.filterSchema.parse({
      exists: {
        path: "employments",
        where: {
          and: [
            {
              exists: {
                path: "organization.path",
                where: { field: "code", op: "eq", value: "root" },
              },
            },
            { field: "roles", op: "containsAll", value: ["reader", "reader"] },
          ],
        },
      },
    }),
  ).toEqual({
    exists: {
      path: "employments",
      where: {
        and: [
          {
            exists: {
              path: "organization.path",
              where: { field: "code", op: "eq", value: "root" },
            },
          },
          { field: "roles", op: "containsAll", value: ["reader"] },
        ],
      },
    },
  });
  expect(engine.filterSchema.safeParse({ field: "mobile", op: "eq", value: null }).success).toBe(false);
  expect(engine.filterSchema.safeParse({ field: "mobile", op: "eq", value: "x".repeat(128) }).success).toBe(true);
  expect(engine.filterSchema.safeParse({ field: "mobile", op: "eq", value: "x".repeat(129) }).success).toBe(false);
  expect(engine.filterSchema.safeParse({ field: "internalId", op: "eq", value: 3 }).success).toBe(false);
  expect(engine.filterSchema.safeParse({ field: "subjectIdentifier", op: "eq", value: "not-a-uuid" }).success).toBe(
    false,
  );
  const expanded = createFilterEngine(searchStructureFromSchema(documentSchema.extend({ revision: z.number().int() })));
  expect(expanded.filterSchema.parse({ field: "revision", op: "eq", value: 2 })).toEqual({
    field: "revision",
    op: "eq",
    value: 2,
  });
});
