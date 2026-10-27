import { z } from "zod";

export const FILTER_MAX_STRING_LENGTH = 128;

export interface SearchScalarFact<
  DocumentSchema extends z.ZodType = z.ZodType,
  ValueSchema extends z.ZodType = z.ZodType,
> {
  readonly kind: "scalar";
  readonly documentSchema: DocumentSchema;
  readonly valueSchema: ValueSchema;
}

export interface SearchScalarArrayFact<
  ItemDocumentSchema extends z.ZodType = z.ZodType,
  ItemValueSchema extends z.ZodType = z.ZodType,
> {
  readonly kind: "scalar-array";
  readonly itemDocumentSchema: ItemDocumentSchema;
  readonly itemValueSchema: ItemValueSchema;
}

export type SearchFact = SearchScalarFact | SearchScalarArrayFact | SearchObjectFact | SearchCollectionFact;

export type SearchFactShape = Record<string, SearchFact>;

export interface SearchObjectFact<Fields extends SearchFactShape = SearchFactShape> {
  readonly kind: "object";
  readonly fields: Fields;
}

export interface SearchCollectionFact<Fields extends SearchFactShape = SearchFactShape> {
  readonly kind: "collection";
  readonly fields: Fields;
}

export function searchScalar<const DocumentSchema extends z.ZodType, const ValueSchema extends z.ZodType>(
  documentSchema: DocumentSchema,
  valueSchema: ValueSchema,
): SearchScalarFact<DocumentSchema, ValueSchema> {
  return { kind: "scalar", documentSchema, valueSchema };
}

export function searchScalarArray<const ItemDocumentSchema extends z.ZodType, const ItemValueSchema extends z.ZodType>(
  itemDocumentSchema: ItemDocumentSchema,
  itemValueSchema: ItemValueSchema,
): SearchScalarArrayFact<ItemDocumentSchema, ItemValueSchema> {
  return { kind: "scalar-array", itemDocumentSchema, itemValueSchema };
}

export function searchObject<const Fields extends SearchFactShape>(fields: Fields): SearchObjectFact<Fields> {
  return { kind: "object", fields };
}

export function searchCollection<const Fields extends SearchFactShape>(fields: Fields): SearchCollectionFact<Fields> {
  return { kind: "collection", fields };
}

type DocumentValue<Fact extends SearchFact> =
  Fact extends SearchScalarFact<infer Schema, z.ZodType>
    ? z.infer<Schema>
    : Fact extends SearchScalarArrayFact<infer Schema, z.ZodType>
      ? z.infer<Schema>[]
      : Fact extends SearchObjectFact<infer Fields>
        ? { [Key in keyof Fields]: DocumentValue<Fields[Key]> }
        : Fact extends SearchCollectionFact<infer Fields>
          ? { [Key in keyof Fields]: DocumentValue<Fields[Key]> }[]
          : never;

export function createDocumentSchema<const Fact extends SearchFact>(fact: Fact): z.ZodType<DocumentValue<Fact>> {
  if (fact.kind === "scalar") return fact.documentSchema as z.ZodType<DocumentValue<Fact>>;
  if (fact.kind === "scalar-array")
    return z.array(fact.itemDocumentSchema) as unknown as z.ZodType<DocumentValue<Fact>>;

  const shape = Object.fromEntries(
    Object.entries(fact.fields).map(([field, child]) => [field, createDocumentSchema(child)]),
  );
  const objectSchema = z.object(shape).strict();
  return (fact.kind === "collection" ? z.array(objectSchema) : objectSchema) as unknown as z.ZodType<
    DocumentValue<Fact>
  >;
}
