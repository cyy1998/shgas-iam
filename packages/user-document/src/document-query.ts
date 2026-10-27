import { z } from "@hono/zod-openapi";
import type { UserDocument } from "@iam/contracts";
import { UserDocumentSchema } from "@iam/contracts";
import type { PublishedUserLoginProfile } from "@iam/domain";
import { PublishedUserLoginProfileSchema } from "@iam/domain";
import type { FilterForShape } from "@iam/filter-engine";
import { createFilterEngine, createFilterTransportSchemas, searchStructureFromSchema } from "@iam/filter-engine";
import type { SQL, SQLWrapper } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { PublishedUserDocument, StoredUserDocument } from "./document";
import { PublishedUserDocumentMetadataSchema, PublishedUserDocumentSchema, StoredUserDocumentSchema } from "./document";

const structure = searchStructureFromSchema(UserDocumentSchema);
const engine = createFilterEngine(structure);
const transport = createFilterTransportSchemas({
  annotateExpression: (schema) => schema.openapi("UserDocumentFilterExpression"),
});

export type UserDocumentFilter = FilterForShape<typeof structure.fields>;
export const UserDocumentFilterSchema = engine.filterSchema;
export const UserDocumentSearchRequestSchema = z.object({ filter: UserDocumentFilterSchema }).strict();
export const UserDocumentSearchTransportRequestSchema = z
  .object({ filter: transport.budgetedSchema })
  .strict()
  .openapi("UserDocumentSearchRequest");

/** The Client is supplied by authentication, never by the Filter AST. */
export function compileUserDocumentFilter(filter: unknown, document: SQLWrapper, clientCode: string): SQL {
  return engine.compile(filter, createClientUserDocumentSql(document, clientCode));
}

/** A filter view; serialize responses through projectUserDocument's public schema. */
export function createClientUserDocumentSql(document: SQLWrapper, clientCode: string): SQL {
  z.string().min(1).parse(clientCode);
  return sql`jsonb_build_object(
    'subjectIdentifier', ${document}->'subjectIdentifier',
    'username', ${document}->'username',
    'name', ${document}->'name',
    'mobile', ${document}->'mobile',
    'wxId', ${document}->'wxId',
    'userType', ${document}->'userType',
    'status', ${document}->'status',
    'employments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'isPrimary', document_employment.value->'isPrimary',
        'organization', document_employment.value->'organization',
        'position', document_employment.value->'position',
        'responsibilities', document_employment.value->'responsibilities',
        'roles', COALESCE((
          SELECT jsonb_agg(document_role.value->'code' ORDER BY document_authorization.ordinality, document_role.ordinality)
          FROM jsonb_array_elements(document_employment.value->'clientAuthorizations')
            WITH ORDINALITY AS document_authorization(value, ordinality)
          CROSS JOIN LATERAL jsonb_array_elements(document_authorization.value->'roles')
            WITH ORDINALITY AS document_role(value, ordinality)
          WHERE document_authorization.value->>'clientCode' = ${clientCode}
        ), '[]'::jsonb)
      ) ORDER BY document_employment.ordinality)
      FROM jsonb_array_elements(${document}->'employments')
        WITH ORDINALITY AS document_employment(value, ordinality)
    ), '[]'::jsonb)
  )`;
}

export function projectUserDocument(input: StoredUserDocument, clientCode: string): UserDocument {
  z.string().min(1).parse(clientCode);
  const document = StoredUserDocumentSchema.parse(input);
  return UserDocumentSchema.parse({
    ...document,
    employments: document.employments.map((employment) => ({
      isPrimary: employment.isPrimary,
      organization: employment.organization,
      position: employment.position,
      responsibilities: employment.responsibilities,
      roles: employment.clientAuthorizations
        .filter((authorization) => authorization.clientCode === clientCode)
        .flatMap((authorization) => authorization.roles.map((role) => role.code)),
    })),
  });
}

export function projectPublishedUserDocument(input: PublishedUserDocument, clientCode: string): UserDocument | null {
  const publication = PublishedUserDocumentSchema.parse(input);
  return publication.document === null ? null : projectUserDocument(publication.document, clientCode);
}

const LoginPublicationSchema = PublishedUserDocumentMetadataSchema.extend({
  document: PublishedUserLoginProfileSchema.extend({ subjectIdentifier: z.uuid() }).nullable(),
});
const MobilePublicationSchema = PublishedUserDocumentMetadataSchema.extend({
  document: z.object({ subjectIdentifier: z.uuid(), mobile: z.string().max(20).nullable() }).nullable(),
});

export function deriveDocumentLoginProfile(input: unknown): PublishedUserLoginProfile | null {
  const publication = LoginPublicationSchema.parse(input);
  if (publication.document !== null && publication.document.subjectIdentifier !== publication.subjectIdentifier)
    throw new Error("Login document identity mismatch");
  return publication.document === null ? null : PublishedUserLoginProfileSchema.parse(publication.document);
}

export function deriveDocumentMobile(input: unknown): { mobile: string | null } | null {
  const publication = MobilePublicationSchema.parse(input);
  if (publication.document !== null && publication.document.subjectIdentifier !== publication.subjectIdentifier)
    throw new Error("Mobile document identity mismatch");
  return publication.document === null ? null : { mobile: publication.document.mobile };
}
