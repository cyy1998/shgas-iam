import { expect, test } from "bun:test";
import { z } from "zod";
import {
  createDocumentSelection,
  createDocumentSorting,
  DocumentPaginationSchema,
  resolveDocumentPagination,
} from "../document-search";

test("pagination normalizes only the enabled mode and rejects unsafe control combinations", () => {
  expect(resolveDocumentPagination(DocumentPaginationSchema.parse({}))).toBeUndefined();
  expect(resolveDocumentPagination(DocumentPaginationSchema.parse({ paginate: true }))).toEqual({
    page: 1,
    pageSize: 50,
    offset: 0,
  });
  expect(resolveDocumentPagination(DocumentPaginationSchema.parse({ paginate: true, page: 3, pageSize: 500 }))).toEqual(
    { page: 3, pageSize: 500, offset: 1000 },
  );
  expect(
    DocumentPaginationSchema.safeParse({ paginate: true, page: Number.MAX_SAFE_INTEGER, pageSize: 1 }).success,
  ).toBe(true);
  for (const controls of [
    { page: 1 },
    { paginate: false, pageSize: 50 },
    { paginate: "true" },
    { paginate: true, page: Number.MAX_SAFE_INTEGER, pageSize: 2 },
    { paginate: true, page: Number.MAX_SAFE_INTEGER + 1, pageSize: 1 },
    { paginate: true, pageSize: 501 },
    { paginate: true, page: 1.5 },
  ])
    expect(DocumentPaginationSchema.safeParse(controls).success).toBe(false);
  const extended = DocumentPaginationSchema.safeExtend({ filter: z.string().optional() });
  expect(extended.safeParse({ filter: "example", page: 1 }).success).toBe(false);
  expect(
    extended.safeParse({ filter: "example", paginate: true, page: Number.MAX_SAFE_INTEGER, pageSize: 2 }).success,
  ).toBe(false);
});

test("selection counts distinct public paths before parent overlap normalization", () => {
  const schema = z.object({
    group: z.object(Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`field${i}`, z.string()]))),
  });
  const selection = createDocumentSelection(schema, ["group"]);
  const paths = Array.from({ length: 64 }, (_, i) => `group.field${i}`);
  expect(selection.selectSchema.safeParse(paths).success).toBe(true);
  expect(selection.selectSchema.safeParse([...paths, "group"]).success).toBe(false);
  expect(selection.selectSchema.safeParse(Array.from({ length: 128 }, () => "group")).success).toBe(true);
});

test("sorting derives root scalar fields and wire types from the public schema", () => {
  enum NumericEnum {
    Two = 2,
    Ten = 10,
  }
  const sorting = createDocumentSorting(
    z.object({
      number: z.number(),
      numericEnum: z.enum(NumericEnum),
      stringEnum: z.enum(["A", "b"]),
      nullable: z.string().nullable(),
      bool: z.boolean(),
      object: z.object({ nested: z.string() }),
      array: z.array(z.string()),
    }),
  );
  expect(
    sorting.parse([
      { field: "numericEnum", direction: "asc" },
      { field: "nullable", direction: "desc" },
      { field: "bool", direction: "asc" },
    ]),
  ).toEqual([
    { field: "numericEnum", direction: "asc", type: "number" },
    { field: "nullable", direction: "desc", type: "string" },
    { field: "bool", direction: "asc", type: "boolean" },
  ]);
  expect(
    sorting.parse([
      { field: "number", direction: "desc" },
      { field: "stringEnum", direction: "asc" },
    ]),
  ).toEqual([
    { field: "number", direction: "desc", type: "number" },
    { field: "stringEnum", direction: "asc", type: "string" },
  ]);
  for (const field of ["object", "array", "object.nested", "private"]) {
    expect(sorting.sortSchema.safeParse([{ field, direction: "asc" }]).success).toBe(false);
  }
});
