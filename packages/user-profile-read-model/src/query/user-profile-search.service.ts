import { UserProfileBaseSchema } from "@iam/domain/user";
import { FilterValidationError } from "@iam/filter-engine";
import { z } from "zod";
import { UserProfileSearchDocumentSchema } from "../schema/profile-search.schema";
import {
  UserProfileDocumentIntegrityError,
  UserProfileFilterValidationError,
  UserProfileSearchResultTooLargeError,
  UserProfileSearchUnavailableError,
} from "./user-profile-search.error";
import type { UserProfileSearchRepositoryPort } from "./user-profile-search.port";
import { USER_PROFILE_RESULT_LIMIT } from "./user-profile-search.port";

const SearchRequestEnvelopeSchema = z.object({ filter: z.unknown().nonoptional() }).strict();

export interface UserProfileSearchServiceDeps {
  readonly profileRepository: UserProfileSearchRepositoryPort;
}

export function createUserProfileSearchService(deps: UserProfileSearchServiceDeps) {
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
    throw new UserProfileFilterValidationError();
  }

  let rows: readonly Row[];
  try {
    rows = await search(request.filter);
  } catch (error) {
    if (error instanceof FilterValidationError) throw new UserProfileFilterValidationError();
    throw new UserProfileSearchUnavailableError();
  }
  if (rows.length > USER_PROFILE_RESULT_LIMIT) throw new UserProfileSearchResultTooLargeError();
  return rows;
}

function parseRows<Row extends { readonly searchDocument: unknown }, Result>(
  rows: readonly Row[],
  parse: (row: Row) => Result,
) {
  try {
    return rows.map((row) => {
      UserProfileSearchDocumentSchema.parse(row.searchDocument);
      return parse(row);
    });
  } catch {
    throw new UserProfileDocumentIntegrityError();
  }
}

export type UserProfileSearchService = ReturnType<typeof createUserProfileSearchService>;
