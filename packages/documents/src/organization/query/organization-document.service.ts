import { organizationDocumentSelection, resolveDocumentPagination } from "@iam/contracts";
import { FilterValidationError } from "@iam/filter-engine";
import { parseStoredOrganizationDocument } from "../schema";
import {
  OrganizationDirectoryNotFoundError,
  OrganizationDocumentFilterValidationError,
  OrganizationDocumentResultTooLargeError,
  OrganizationDocumentUnavailableError,
} from "./organization-document.error";
import { OrganizationDocumentRequestSchema } from "./organization-document.filter";
import {
  ORGANIZATION_DOCUMENT_RESULT_LIMIT,
  type OrganizationDocumentQueryRepositoryPort,
} from "./organization-document.port";

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
      const request = OrganizationDocumentRequestSchema.safeParse(input);
      if (!request.success) throw new OrganizationDocumentFilterValidationError();
      const pagination = resolveDocumentPagination(request.data);
      let result: Awaited<ReturnType<OrganizationDocumentQueryRepositoryPort["searchCurrentDocuments"]>>;
      try {
        result = await deps.repository.searchCurrentDocuments(request.data.filter, request.data.sort, pagination);
      } catch (error) {
        if (error instanceof FilterValidationError) throw new OrganizationDocumentFilterValidationError();
        throw new OrganizationDocumentUnavailableError();
      }
      if (pagination === undefined && result.rows.length > ORGANIZATION_DOCUMENT_RESULT_LIMIT)
        throw new OrganizationDocumentResultTooLargeError();
      try {
        const items = result.rows.map((row) =>
          organizationDocumentSelection.select(parseStoredOrganizationDocument(row.document), request.data.select),
        );
        return { items, total: result.total, page: pagination?.page ?? null, pageSize: pagination?.pageSize ?? null };
      } catch {
        throw new OrganizationDocumentUnavailableError();
      }
    },
  };
}

export type OrganizationDocumentQueryService = ReturnType<typeof createOrganizationDocumentQueryService>;
