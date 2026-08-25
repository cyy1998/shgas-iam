import type { V3UserProfileFilter } from "./profile-v3-filter";
import type { V3UserProfileQueryRepositoryPort } from "./profile-v3-query.port";
import { UserProfileBaseSchema } from "@iam/domain/user";
import { V3UserProfileSearchRequestSchema } from "./profile-v3-filter";
import {
  V3UserProfileDocumentIntegrityError,
  V3UserProfileFilterValidationError,
  V3UserProfileSearchResultTooLargeError,
  V3UserProfileSearchUnavailableError,
} from "./profile-v3-query.error";
import { V3_USER_PROFILE_RESULT_LIMIT } from "./profile-v3-query.port";
import { V3UserProfileSearchDocumentSchema } from "./profile-v3-search.schema";
import { parseUserProfileDetailDocument } from "./profile.schema";

export interface V3UserProfileQueryServiceDeps {
  readonly profileRepository: V3UserProfileQueryRepositoryPort;
}

export function createV3UserProfileQueryService(
  deps: V3UserProfileQueryServiceDeps,
) {
  return {
    async search(input: unknown) {
      const rows = await executeSearch(input, deps.profileRepository.searchCurrentProfiles);
      return parseRows(rows, row => parseUserProfileDetailDocument(row.detail));
    },
    async searchBase(input: unknown) {
      const rows = await executeSearch(input, deps.profileRepository.searchCurrentProfileBases);
      return parseRows(rows, row => UserProfileBaseSchema.parse({
        mobile: row.mobile,
        name: row.name,
        subjectIdentifier: row.subjectIdentifier,
        username: row.username,
        wxId: row.wxId,
      }));
    },
  };
}

async function executeSearch<Row>(
  input: unknown,
  search: (filter: V3UserProfileFilter) => Promise<readonly Row[]>,
) {
  let request;
  try {
    request = V3UserProfileSearchRequestSchema.parse(input);
  }
  catch {
    throw new V3UserProfileFilterValidationError();
  }

  let rows;
  try {
    rows = await search(request.filter);
  }
  catch {
    throw new V3UserProfileSearchUnavailableError();
  }
  if (rows.length > V3_USER_PROFILE_RESULT_LIMIT)
    throw new V3UserProfileSearchResultTooLargeError();
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
  }
  catch {
    throw new V3UserProfileDocumentIntegrityError();
  }
}

export type V3UserProfileQueryService = ReturnType<
  typeof createV3UserProfileQueryService
>;
