import type { SQLWrapper } from "drizzle-orm";
import type {
  InternalUserProfileEmploymentFilterDsl,
  InternalUserProfileFilterDsl,
  InternalUserProfileResponsibilityFilterDsl,
} from "./internal-user-query.schema";
import { userProfiles } from "@iam/db/schema";
import { and, inArray, not, or, sql } from "drizzle-orm";

type BooleanFilter<T> = { all: T[] } | { any: T[] } | { not: T };

export function compileInternalUserProfileFilter(
  filter: InternalUserProfileFilterDsl,
): SQLWrapper {
  if (isBooleanFilter<InternalUserProfileFilterDsl>(filter))
    return compileBooleanFilter(filter, compileInternalUserProfileFilter);

  const employmentDocument = sql.raw("candidate_employment.value");
  return sql`EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      ${userProfiles.searchDoc} -> 'employments'
    ) AS candidate_employment(value)
    WHERE ${compileEmploymentFilter(filter.where, employmentDocument)}
  )`;
}

function compileEmploymentFilter(
  filter: InternalUserProfileEmploymentFilterDsl,
  employmentDocument: SQLWrapper,
): SQLWrapper {
  if (isBooleanFilter<InternalUserProfileEmploymentFilterDsl>(filter)) {
    return compileBooleanFilter(
      filter,
      child => compileEmploymentFilter(child, employmentDocument),
    );
  }

  const responsibilityDocument = sql.raw("candidate_responsibility.value");
  return sql`EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      ${employmentDocument} -> 'responsibilities'
    ) AS candidate_responsibility(value)
    WHERE ${compileResponsibilityFilter(filter.where, responsibilityDocument)}
  )`;
}

function compileResponsibilityFilter(
  filter: InternalUserProfileResponsibilityFilterDsl,
  responsibilityDocument: SQLWrapper,
): SQLWrapper {
  if (isBooleanFilter<InternalUserProfileResponsibilityFilterDsl>(filter)) {
    return compileBooleanFilter(
      filter,
      child => compileResponsibilityFilter(child, responsibilityDocument),
    );
  }

  if (filter.field === "responsibility.type.code") {
    const field = sql<string>`${responsibilityDocument} #>> '{type,code}'`;
    return filter.op === "eq" ? sql`${field} = ${filter.value}` : inArray(field, filter.value);
  }

  if (filter.field === "responsibility.targetOrganization.type") {
    const field = sql<string>`${responsibilityDocument} #>> '{targetOrganization,type}'`;
    return filter.op === "eq" ? sql`${field} = ${filter.value}` : inArray(field, filter.value);
  }

  if (filter.op === "withinSubtreeOf") {
    return sql`EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        ${responsibilityDocument} #> '{targetOrganization,path}'
      ) AS candidate_target_path(value)
      WHERE candidate_target_path.value ->> 'code' = ${filter.value}
    )`;
  }

  const field = sql<string>`${responsibilityDocument} #>> '{targetOrganization,code}'`;
  return filter.op === "eq" ? sql`${field} = ${filter.value}` : inArray(field, filter.value);
}

function compileBooleanFilter<T>(
  filter: BooleanFilter<T>,
  compileChild: (child: T) => SQLWrapper,
): SQLWrapper {
  if ("all" in filter)
    return and(...filter.all.map(compileChild)) ?? sql`false`;
  if ("any" in filter)
    return or(...filter.any.map(compileChild)) ?? sql`false`;
  return not(compileChild(filter.not));
}

function isBooleanFilter<T extends object>(
  filter: T | BooleanFilter<T>,
): filter is BooleanFilter<T> {
  return "all" in filter || "any" in filter || "not" in filter;
}
