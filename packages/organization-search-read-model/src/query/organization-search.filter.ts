import { createFilterEngine, type FilterForShape } from "@iam/filter-engine";
import { z } from "zod";
import { ORGANIZATION_SEARCH_STRUCTURE } from "../schema";

export type OrganizationSearchFilter = FilterForShape<typeof ORGANIZATION_SEARCH_STRUCTURE.fields>;
export const organizationSearchFilterEngine = createFilterEngine(ORGANIZATION_SEARCH_STRUCTURE);
export const OrganizationSearchRequestSchema = z
  .object({ filter: organizationSearchFilterEngine.filterSchema })
  .strict();
