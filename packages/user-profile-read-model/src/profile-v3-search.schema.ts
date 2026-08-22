import { z } from "@hono/zod-openapi";
import {
  OrganizationResponsibilityTypeCode,
  OrganizationType,
  UserStatus,
  UserType,
} from "@iam/contracts";

export const V3_USER_PROFILE_FILTER_MAX_STRING_LENGTH = 128;

const queryStringSchema = z.string().max(
  V3_USER_PROFILE_FILTER_MAX_STRING_LENGTH,
);

export interface V3UserProfileSearchScalarFact<
  DocumentSchema extends z.ZodType = z.ZodType,
  ValueSchema extends z.ZodType = z.ZodType,
> {
  readonly kind: "scalar";
  readonly documentSchema: DocumentSchema;
  readonly valueSchema: ValueSchema;
}

export interface V3UserProfileSearchScalarArrayFact<
  ItemDocumentSchema extends z.ZodType = z.ZodType,
  ItemValueSchema extends z.ZodType = z.ZodType,
> {
  readonly kind: "scalar-array";
  readonly itemDocumentSchema: ItemDocumentSchema;
  readonly itemValueSchema: ItemValueSchema;
}

export type V3UserProfileSearchFact
  = | V3UserProfileSearchScalarFact
    | V3UserProfileSearchScalarArrayFact
    | V3UserProfileSearchObjectFact
    | V3UserProfileSearchCollectionFact;

export type V3UserProfileSearchFactShape = Record<string, V3UserProfileSearchFact>;

export interface V3UserProfileSearchObjectFact<
  Fields extends V3UserProfileSearchFactShape = V3UserProfileSearchFactShape,
> {
  readonly kind: "object";
  readonly fields: Fields;
}

export interface V3UserProfileSearchCollectionFact<
  Fields extends V3UserProfileSearchFactShape = V3UserProfileSearchFactShape,
> {
  readonly kind: "collection";
  readonly fields: Fields;
}

export interface V3UserProfileSearchOrganizationFact<
  Fields extends V3UserProfileSearchFactShape = V3UserProfileSearchFactShape,
  ValueSchema extends z.ZodType<string> = z.ZodType<string>,
> extends V3UserProfileSearchObjectFact<Fields> {
  readonly organization: {
    readonly valueSchema: ValueSchema;
    readonly pathField: "path";
    readonly codeField: "code";
  };
}

export const V3_USER_PROFILE_USER_SCALARS = {
  subjectIdentifier: searchScalar(z.uuid(), z.uuid()),
  username: searchScalar(z.string().max(64), queryStringSchema),
  name: searchScalar(z.string().max(64), queryStringSchema),
  mobile: searchScalar(z.string().max(20).nullable(), queryStringSchema),
  wxId: searchScalar(z.string().max(255).nullable(), queryStringSchema),
  userType: searchScalar(z.enum(UserType), z.enum(UserType)),
  status: searchScalar(z.enum(UserStatus), z.enum(UserStatus)),
} as const;

const V3_ORGANIZATION_NODE_FIELDS = {
  code: searchScalar(z.string(), queryStringSchema),
  name: searchScalar(z.string(), queryStringSchema),
  type: searchScalar(z.enum(OrganizationType), z.enum(OrganizationType)),
} as const;

const V3_ORGANIZATION_PATH_NODE_FIELDS = {
  ...V3_ORGANIZATION_NODE_FIELDS,
  distanceToTarget: searchScalar(z.number().int().nonnegative(), z.number().int().nonnegative()),
} as const;

const V3_ORGANIZATION_REFERENCE_FIELDS = {
  ...V3_ORGANIZATION_NODE_FIELDS,
  path: searchCollection(V3_ORGANIZATION_PATH_NODE_FIELDS),
} as const;

export const V3_USER_PROFILE_SEARCH_STRUCTURE = searchObject({
  user: searchObject(V3_USER_PROFILE_USER_SCALARS),
  employments: searchCollection({
    isPrimary: searchScalar(z.boolean(), z.boolean()),
    organization: searchOrganization(V3_ORGANIZATION_REFERENCE_FIELDS),
    position: searchObject({
      code: searchScalar(z.string(), queryStringSchema),
      name: searchScalar(z.string(), queryStringSchema),
    }),
    roles: searchScalarArray(z.string(), queryStringSchema),
    privileges: searchScalarArray(z.string(), queryStringSchema),
    responsibilities: searchCollection({
      type: searchObject({
        code: searchScalar(
          z.enum(OrganizationResponsibilityTypeCode),
          z.enum(OrganizationResponsibilityTypeCode),
        ),
        name: searchScalar(z.string(), queryStringSchema),
      }),
      targetOrganization: searchOrganization(V3_ORGANIZATION_REFERENCE_FIELDS),
    }),
  }),
});

export const V3UserProfileSearchDocumentSchema = createDocumentSchema(
  V3_USER_PROFILE_SEARCH_STRUCTURE,
);

export type V3UserProfileSearchDocument = z.infer<
  typeof V3UserProfileSearchDocumentSchema
>;

function searchScalar<
  const DocumentSchema extends z.ZodType,
  const ValueSchema extends z.ZodType,
>(
  documentSchema: DocumentSchema,
  valueSchema: ValueSchema,
): V3UserProfileSearchScalarFact<DocumentSchema, ValueSchema> {
  return { kind: "scalar", documentSchema, valueSchema };
}

function searchScalarArray<
  const ItemDocumentSchema extends z.ZodType,
  const ItemValueSchema extends z.ZodType,
>(
  itemDocumentSchema: ItemDocumentSchema,
  itemValueSchema: ItemValueSchema,
): V3UserProfileSearchScalarArrayFact<ItemDocumentSchema, ItemValueSchema> {
  return { kind: "scalar-array", itemDocumentSchema, itemValueSchema };
}

function searchObject<const Fields extends V3UserProfileSearchFactShape>(
  fields: Fields,
): V3UserProfileSearchObjectFact<Fields> {
  return { kind: "object", fields };
}

function searchCollection<const Fields extends V3UserProfileSearchFactShape>(
  fields: Fields,
): V3UserProfileSearchCollectionFact<Fields> {
  return { kind: "collection", fields };
}

function searchOrganization<const Fields extends V3UserProfileSearchFactShape>(
  fields: Fields,
): V3UserProfileSearchOrganizationFact<Fields, typeof queryStringSchema> {
  return {
    kind: "object",
    fields,
    organization: {
      valueSchema: queryStringSchema,
      pathField: "path",
      codeField: "code",
    },
  };
}

type DocumentValue<Fact extends V3UserProfileSearchFact>
  = Fact extends V3UserProfileSearchScalarFact<infer Schema, z.ZodType>
    ? z.infer<Schema>
    : Fact extends V3UserProfileSearchScalarArrayFact<infer Schema, z.ZodType>
      ? z.infer<Schema>[]
      : Fact extends V3UserProfileSearchObjectFact<infer Fields>
        ? { [Key in keyof Fields]: DocumentValue<Fields[Key]> }
        : Fact extends V3UserProfileSearchCollectionFact<infer Fields>
          ? { [Key in keyof Fields]: DocumentValue<Fields[Key]> }[]
          : never;

function createDocumentSchema<const Fact extends V3UserProfileSearchFact>(
  fact: Fact,
): z.ZodType<DocumentValue<Fact>> {
  if (fact.kind === "scalar")
    return fact.documentSchema as z.ZodType<DocumentValue<Fact>>;
  if (fact.kind === "scalar-array")
    return z.array(fact.itemDocumentSchema) as unknown as z.ZodType<DocumentValue<Fact>>;

  const shape = Object.fromEntries(
    Object.entries(fact.fields).map(([field, child]) => [
      field,
      createDocumentSchema(child),
    ]),
  );
  const objectSchema = z.object(shape).strict();
  return ((fact.kind === "collection" ? z.array(objectSchema) : objectSchema) as unknown) as z.ZodType<
    DocumentValue<Fact>
  >;
}
