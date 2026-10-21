import { z } from "@hono/zod-openapi";
import { OrganizationResponsibilityTypeCode, OrganizationType, UserStatus, UserType } from "@iam/contracts";
import type { SearchFactShape, SearchOrganizationFact } from "@iam/filter-engine";
import {
  createDocumentSchema,
  searchOrganization as createSearchOrganization,
  FILTER_MAX_STRING_LENGTH,
  searchCollection,
  searchObject,
  searchScalar,
  searchScalarArray,
} from "@iam/filter-engine";

export type {
  SearchCollectionFact as UserProfileSearchCollectionFact,
  SearchFact as UserProfileSearchFact,
  SearchFactShape as UserProfileSearchFactShape,
  SearchObjectFact as UserProfileSearchObjectFact,
  SearchOrganizationFact as UserProfileSearchOrganizationFact,
  SearchScalarArrayFact as UserProfileSearchScalarArrayFact,
  SearchScalarFact as UserProfileSearchScalarFact,
} from "@iam/filter-engine";

export const USER_PROFILE_FILTER_MAX_STRING_LENGTH = FILTER_MAX_STRING_LENGTH;
const queryStringSchema = z.string().max(USER_PROFILE_FILTER_MAX_STRING_LENGTH);

export const USER_PROFILE_USER_SCALARS = {
  subjectIdentifier: searchScalar(z.uuid(), z.uuid()),
  username: searchScalar(z.string().max(64), queryStringSchema),
  name: searchScalar(z.string().max(64), queryStringSchema),
  mobile: searchScalar(z.string().max(20).nullable(), queryStringSchema),
  wxId: searchScalar(z.string().max(255).nullable(), queryStringSchema),
  userType: searchScalar(z.enum(UserType), z.enum(UserType)),
  status: searchScalar(z.enum(UserStatus), z.enum(UserStatus)),
} as const;

const ORGANIZATION_NODE_FIELDS = {
  code: searchScalar(z.string(), queryStringSchema),
  name: searchScalar(z.string(), queryStringSchema),
  type: searchScalar(z.enum(OrganizationType), z.enum(OrganizationType)),
} as const;

const ORGANIZATION_PATH_NODE_FIELDS = {
  ...ORGANIZATION_NODE_FIELDS,
  distanceToTarget: searchScalar(z.number().int().nonnegative(), z.number().int().nonnegative()),
} as const;

const ORGANIZATION_REFERENCE_FIELDS = {
  ...ORGANIZATION_NODE_FIELDS,
  path: searchCollection(ORGANIZATION_PATH_NODE_FIELDS),
} as const;

export const USER_PROFILE_SEARCH_STRUCTURE = searchObject({
  user: searchObject(USER_PROFILE_USER_SCALARS),
  employments: searchCollection({
    isPrimary: searchScalar(z.boolean(), z.boolean()),
    organization: searchOrganization(ORGANIZATION_REFERENCE_FIELDS),
    position: searchObject({
      code: searchScalar(z.string(), queryStringSchema),
      name: searchScalar(z.string(), queryStringSchema),
    }),
    roles: searchScalarArray(z.string(), queryStringSchema),
    responsibilities: searchCollection({
      type: searchObject({
        code: searchScalar(z.enum(OrganizationResponsibilityTypeCode), z.enum(OrganizationResponsibilityTypeCode)),
        name: searchScalar(z.string(), queryStringSchema),
      }),
      targetOrganization: searchOrganization(ORGANIZATION_REFERENCE_FIELDS),
    }),
  }),
});

export const UserProfileSearchDocumentSchema = createDocumentSchema(USER_PROFILE_SEARCH_STRUCTURE);

export type UserProfileSearchDocument = z.infer<typeof UserProfileSearchDocumentSchema>;

function searchOrganization<const Fields extends SearchFactShape>(
  fields: Fields,
): SearchOrganizationFact<Fields, typeof queryStringSchema> {
  return createSearchOrganization(fields, { valueSchema: queryStringSchema, pathField: "path", codeField: "code" });
}
