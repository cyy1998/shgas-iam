import { z } from "zod";
import {
  FILTER_MAX_STRING_LENGTH,
  type SearchCollectionFact,
  type SearchFact,
  type SearchFactShape,
  type SearchObjectFact,
  type SearchScalarArrayFact,
  type SearchScalarFact,
  searchCollection,
  searchObject,
  searchScalar,
  searchScalarArray,
} from "./structure";

type SearchFieldsFromSchema<Fields extends z.ZodRawShape> = {
  [Field in keyof Fields]: Fields[Field] extends z.ZodType ? SearchFactFromSchema<Fields[Field]> : never;
};

type SearchFactFromSchema<Schema extends z.ZodType> =
  Schema extends z.ZodObject<infer Fields>
    ? SearchObjectFact<SearchFieldsFromSchema<Fields>>
    : Schema extends z.ZodArray<infer Item extends z.ZodType>
      ? Item extends z.ZodObject<infer Fields>
        ? SearchCollectionFact<SearchFieldsFromSchema<Fields>>
        : SearchScalarArrayFact<Item, z.ZodType<Exclude<z.output<Item>, null>>>
      : SearchScalarFact<Schema, z.ZodType<Exclude<z.output<Schema>, null>>>;

/** Derive legal paths and scalar query types from the public schema. */
export function searchStructureFromSchema<Schema extends z.ZodObject>(schema: Schema) {
  function fieldsOf(object: z.ZodObject): SearchFactShape {
    return Object.fromEntries(Object.entries(object.shape).map(([name, child]) => [name, factOf(child)]));
  }

  function factOf(child: z.ZodType): SearchFact {
    if (child instanceof z.ZodObject) {
      return searchObject(fieldsOf(child));
    }
    if (child instanceof z.ZodArray) {
      const item = requireSchema(child.element);
      return item instanceof z.ZodObject
        ? searchCollection(fieldsOf(item))
        : searchScalarArray(item, scalarValueSchema(item));
    }
    return searchScalar(child, scalarValueSchema(child));
  }

  return searchObject(fieldsOf(schema)) as SearchObjectFact<SearchFieldsFromSchema<Schema["shape"]>>;
}

function scalarValueSchema(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodNullable) return scalarValueSchema(requireSchema(schema.unwrap()));
  if (schema instanceof z.ZodString) return schema.format ? schema.max(FILTER_MAX_STRING_LENGTH) : queryStringSchema();
  if (schema.type === "string") {
    return schema.refine((value) => typeof value === "string" && value.length <= FILTER_MAX_STRING_LENGTH);
  }
  if (schema instanceof z.ZodEnum || schema instanceof z.ZodBoolean) return schema;
  if (schema instanceof z.ZodNumber) {
    const number = schema.isInt ? z.number().int() : z.number();
    return schema.minValue !== null && schema.minValue >= 0 ? number.nonnegative() : number;
  }
  throw new Error("Public search schemas support only scalar values, objects and their collections");
}

function requireSchema(input: unknown): z.ZodType {
  if (!(input instanceof z.ZodType)) throw new Error("Public search structure requires Zod schemas");
  return input;
}

function queryStringSchema() {
  return z.string().max(FILTER_MAX_STRING_LENGTH);
}
