import { z } from "zod";
import { OrganizationDocumentSchema, UserDocumentSchema } from "./document";

export const DOCUMENT_SELECT_PATH_LIMIT = 64;
export const DOCUMENT_SORT_FIELD_LIMIT = 3;
export const DOCUMENT_PAGE_SIZE_LIMIT = 500;

const positiveSafeInteger = z.number().int().positive();
export const DocumentPaginationSchema = z
  .object({
    paginate: z.boolean().default(false),
    page: positiveSafeInteger.optional().describe("开启分页时默认 1"),
    pageSize: positiveSafeInteger.max(DOCUMENT_PAGE_SIZE_LIMIT).optional().describe("开启分页时默认 50，最多 500"),
  })
  .strict()
  .superRefine((request, context) => {
    if (!request.paginate && (request.page !== undefined || request.pageSize !== undefined)) {
      context.addIssue({ code: "custom", message: "关闭分页时不能提供 page 或 pageSize" });
    }
    if (request.paginate && !Number.isSafeInteger(((request.page ?? 1) - 1) * (request.pageSize ?? 50))) {
      context.addIssue({ code: "custom", path: ["page"], message: "分页偏移量必须为安全整数" });
    }
  });

export interface DocumentPage {
  page: number;
  pageSize: number;
  offset: number;
}

/** Consume a request already validated by DocumentPaginationSchema or its safeExtend schema. */
export function resolveDocumentPagination(request: z.infer<typeof DocumentPaginationSchema>): DocumentPage | undefined {
  if (!request.paginate) return undefined;
  const page = request.page ?? 1;
  const pageSize = request.pageSize ?? 50;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** Root scalar types and legal sort fields have the same source as the public document. */
export function createDocumentSorting(schema: z.ZodObject) {
  const types = new Map<string, "string" | "number" | "boolean">();
  for (const [field, child] of Object.entries(schema.shape)) {
    let value: z.ZodType = child;
    if (value instanceof z.ZodNullable) value = requireSchema(value.unwrap());
    if (value instanceof z.ZodObject || value instanceof z.ZodArray) continue;
    if (value instanceof z.ZodNumber) types.set(field, "number");
    else if (value instanceof z.ZodBoolean) types.set(field, "boolean");
    else if (value.type === "string") types.set(field, "string");
    else if (value instanceof z.ZodEnum) {
      // Numeric TypeScript enums include reverse names; only accepted values define the wire type.
      const options = value.options.filter((option) => value.safeParse(option).success);
      if (options.every((option) => typeof option === "number")) types.set(field, "number");
      else if (options.every((option) => typeof option === "string")) types.set(field, "string");
      else throw new Error("Document sorting requires homogeneous scalar enums");
    } else throw new Error("Document sorting supports only root scalar fields");
  }
  const sortSchema = z
    .array(
      z
        .object({
          field: z.enum([...types.keys()]),
          direction: z.enum(["asc", "desc"]),
        })
        .strict(),
    )
    .min(1)
    .max(DOCUMENT_SORT_FIELD_LIMIT)
    .describe("按公开根级标量依次排序，最多三项；字符串固定字节序，空值始终最后，同值按内部 ID 升序");
  return {
    sortSchema,
    parse(sort: unknown) {
      return sortSchema.parse(sort).map((item) => {
        const type = types.get(item.field);
        if (type === undefined) throw new Error("Document sorting requires a public scalar type");
        return { ...item, type };
      });
    },
  };
}

export type DocumentSort = z.infer<ReturnType<typeof createDocumentSorting>["sortSchema"]>;
export const userDocumentSorting = createDocumentSorting(UserDocumentSchema);
export const organizationDocumentSorting = createDocumentSorting(OrganizationDocumentSchema);

export type SelectedDocument<Value> = Value extends readonly (infer Item)[]
  ? SelectedDocument<Item>[]
  : Value extends object
    ? { [Key in keyof Value]?: SelectedDocument<Value[Key]> }
    : Value;

/** Paths and output shapes follow the public document schema, including collection elements. */
export function createDocumentSelection<Schema extends z.ZodObject>(
  schema: Schema,
  defaultFields: readonly (keyof z.output<Schema> & string)[],
) {
  const paths: string[] = [];
  function visit(object: z.ZodObject, prefix = "") {
    for (const [field, child] of Object.entries(object.shape)) {
      const path = prefix ? `${prefix}.${field}` : field;
      paths.push(path);
      let value: z.ZodType = child;
      if (value instanceof z.ZodNullable) value = requireSchema(value.unwrap());
      if (value instanceof z.ZodArray) value = requireSchema(value.element);
      if (value instanceof z.ZodObject) visit(value, path);
    }
  }
  visit(schema);
  const selectSchema = z
    .array(z.enum(paths))
    .min(1)
    .refine(
      (selection) => new Set(selection).size <= DOCUMENT_SELECT_PATH_LIMIT,
      `最多选择 ${DOCUMENT_SELECT_PATH_LIMIT} 个不同字段路径`,
    )
    .describe(`公开字段路径；去重后最多 ${DOCUMENT_SELECT_PATH_LIMIT} 项，省略时返回 ${defaultFields.join("、")}`);
  const selectedDocumentSchema = selectedSchema(schema) as z.ZodType<SelectedDocument<z.output<Schema>>>;
  return {
    selectSchema,
    selectedDocumentSchema,
    select(document: z.output<Schema>, selection: readonly string[] = defaultFields) {
      const fields = selectSchema.parse(selection);
      return selectedDocumentSchema.parse(
        project(
          document,
          fields.map((field) => field.split(".")),
        ),
      );
    },
  };
}

function selectedSchema(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodObject) {
    return z.object(
      Object.fromEntries(Object.entries(schema.shape).map(([key, child]) => [key, selectedSchema(child).optional()])),
    );
  }
  if (schema instanceof z.ZodArray) return z.array(selectedSchema(requireSchema(schema.element)));
  if (schema instanceof z.ZodNullable) return selectedSchema(requireSchema(schema.unwrap())).nullable();
  return schema;
}

function requireSchema(value: unknown): z.ZodType {
  if (!(value instanceof z.ZodType)) throw new Error("Document selection requires Zod schemas");
  return value;
}

function project(value: unknown, paths: readonly string[][]): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((item) => project(item, paths));
  if (typeof value !== "object") throw new Error("Document selection requires an object");
  const object = z.record(z.string(), z.unknown()).parse(value);
  const fields = new Map<string, string[][]>();
  for (const [field, ...rest] of paths) {
    if (field === undefined) continue;
    const children = fields.get(field) ?? [];
    children.push(rest);
    fields.set(field, children);
  }
  return Object.fromEntries(
    [...fields].map(([field, children]) => [
      field,
      children.some((path) => path.length === 0) ? object[field] : project(object[field], children),
    ]),
  );
}

export const userDocumentSelection = createDocumentSelection(UserDocumentSchema, ["subjectIdentifier", "username"]);
export const organizationDocumentSelection = createDocumentSelection(OrganizationDocumentSchema, ["code", "name"]);

export function createDocumentSearchResultSchema<Item extends z.ZodType>(item: Item) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: positiveSafeInteger.nullable(),
    pageSize: positiveSafeInteger.max(DOCUMENT_PAGE_SIZE_LIMIT).nullable(),
  });
}

export const UserDocumentSearchResultSchema = createDocumentSearchResultSchema(
  userDocumentSelection.selectedDocumentSchema,
);
export const OrganizationDocumentSearchResultSchema = createDocumentSearchResultSchema(
  organizationDocumentSelection.selectedDocumentSchema,
);
export type UserDocumentSearchResult = z.infer<typeof UserDocumentSearchResultSchema>;
export type OrganizationDocumentSearchResult = z.infer<typeof OrganizationDocumentSearchResultSchema>;
