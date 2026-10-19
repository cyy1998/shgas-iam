import { UserProfileBaseSchema } from "@iam/domain/user";
import { FilterValidationError } from "@iam/filter-engine";
import { z } from "zod";
import { V3UserProfileSearchDocumentSchema } from "../schema/profile-v3-search.schema";
import {
  V3UserProfileDocumentIntegrityError,
  V3UserProfileFilterValidationError,
  V3UserProfileSearchResultTooLargeError,
  V3UserProfileSearchUnavailableError,
} from "./profile-v3-query.error";
import type { V3UserProfileQueryRepositoryPort } from "./profile-v3-query.port";
import { V3_USER_PROFILE_RESULT_LIMIT } from "./profile-v3-query.port";

const SearchRequestEnvelopeSchema = z.object({ filter: z.unknown().nonoptional() }).strict();

export interface V3UserProfileQueryServiceDeps {
  readonly profileRepository: V3UserProfileQueryRepositoryPort;
}

export function createV3UserProfileQueryService(deps: V3UserProfileQueryServiceDeps) {
  return {
    async searchBase(input: unknown) {
      const rows = await executeSearch(input, deps.profileRepository.searchCurrentProfileBases);
      return parseRows(rows, (row) =>
        UserProfileBaseSchema.parse({
          mobile: row.mobile,
          name: row.name,
          subjectIdentifier: row.subjectIdentifier,
          username: row.username,
          wxId: row.wxId,
        }),
      );
    },
  };
}

async function executeSearch<Row>(input: unknown, search: (filter: unknown) => Promise<readonly Row[]>) {
  let request: ReturnType<typeof SearchRequestEnvelopeSchema.parse>;
  try {
    request = SearchRequestEnvelopeSchema.parse(input);
  } catch {
    throw new V3UserProfileFilterValidationError();
  }

  let rows: readonly Row[];
  try {
    rows = await search(request.filter);
  } catch (error) {
    if (error instanceof FilterValidationError) throw new V3UserProfileFilterValidationError();
    throw new V3UserProfileSearchUnavailableError();
  }
  if (rows.length > V3_USER_PROFILE_RESULT_LIMIT) throw new V3UserProfileSearchResultTooLargeError();
  return rows;
}

function parseRows<Row extends { readonly searchDocument: unknown }, Result>(
  rows: readonly Row[],
  parse: (row: Row) => Result,
) {
  try {
    return rows.map((row) => {
      V3UserProfileSearchDocumentSchema.parse(row.searchDocument);
      return parse(row);
    });
  } catch {
    throw new V3UserProfileDocumentIntegrityError();
  }
}

export type V3UserProfileQueryService = ReturnType<typeof createV3UserProfileQueryService>;
