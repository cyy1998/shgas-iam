import { FilterValidationError } from "@iam/filter-engine";
import { z } from "zod";
import { parseStoredOrganizationDocument } from "../schema";
import {
  OrganizationDirectoryNotFoundError,
  OrganizationDocumentFilterValidationError,
  OrganizationDocumentResultTooLargeError,
  OrganizationDocumentUnavailableError,
} from "./organization-document.error";
import {
  ORGANIZATION_DOCUMENT_RESULT_LIMIT,
  type OrganizationDocumentQueryRepositoryPort,
} from "./organization-document.port";

const SearchRequestEnvelopeSchema = z.object({ filter: z.unknown().nonoptional() }).strict();

export function createOrganizationDocumentQueryService(deps: {
  readonly repository: OrganizationDocumentQueryRepositoryPort;
}) {
  return {
    async getByCode(code: string) {
      let row: { readonly document: unknown } | null;
      try {
        row = await deps.repository.getCurrentDocumentByCode(code);
      } catch {
        throw new OrganizationDocumentUnavailableError();
      }
      if (!row) throw new OrganizationDirectoryNotFoundError();
      try {
        return parseStoredOrganizationDocument(row.document);
      } catch {
        throw new OrganizationDocumentUnavailableError();
      }
    },
    async search(input: unknown) {
      const request = SearchRequestEnvelopeSchema.safeParse(input);
      if (!request.success) throw new OrganizationDocumentFilterValidationError();
      let rows: readonly { readonly document: unknown }[];
      try {
        rows = await deps.repository.searchCurrentDocuments(request.data.filter);
      } catch (error) {
        if (error instanceof FilterValidationError) throw new OrganizationDocumentFilterValidationError();
        throw new OrganizationDocumentUnavailableError();
      }
      if (rows.length > ORGANIZATION_DOCUMENT_RESULT_LIMIT) throw new OrganizationDocumentResultTooLargeError();
      try {
        return rows.map((row) => parseStoredOrganizationDocument(row.document));
      } catch {
        throw new OrganizationDocumentUnavailableError();
      }
    },
  };
}

export type OrganizationDocumentQueryService = ReturnType<typeof createOrganizationDocumentQueryService>;
