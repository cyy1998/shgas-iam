import { isDeepStrictEqual } from "node:util";
import { OrganizationDocumentSchema as PublicOrganizationDocumentSchema } from "@iam/contracts";
import { searchStructureFromSchema } from "@iam/filter-engine";
import type { z } from "zod";

export const ORGANIZATION_DOCUMENT_SCHEMA_VERSION = 1;
export const OrganizationDocumentSchema = PublicOrganizationDocumentSchema;
export const ORGANIZATION_DOCUMENT_STRUCTURE = searchStructureFromSchema(OrganizationDocumentSchema);
export type OrganizationDocument = z.infer<typeof OrganizationDocumentSchema>;

/** Stored business facts are canonical; technical metadata lives on the row. */
export function parseStoredOrganizationDocument(value: unknown): OrganizationDocument {
  const document = OrganizationDocumentSchema.parse(value);
  if (!isDeepStrictEqual(document, value))
    throw new Error("Organization Document contains non-canonical stored fields");
  return document;
}
