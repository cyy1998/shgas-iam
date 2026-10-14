import { OrganizationLevel, OrganizationStatus, OrganizationType } from "@iam/contracts";
import {
  createDocumentSchema,
  FILTER_MAX_STRING_LENGTH,
  searchCollection,
  searchObject,
  searchOrganization,
  searchScalar,
} from "@iam/filter-engine";
import { z } from "zod";

export const ORGANIZATION_SEARCH_SCHEMA_VERSION = 1;
const queryString = z.string().max(FILTER_MAX_STRING_LENGTH);
const level = z.enum(OrganizationLevel);
const nodeFields = {
  code: searchScalar(z.string(), queryString),
  name: searchScalar(z.string(), queryString),
  type: searchScalar(z.enum(OrganizationType), z.enum(OrganizationType)),
  level: searchScalar(level, level),
} as const;

export const ORGANIZATION_SEARCH_STRUCTURE = searchObject({
  organization: searchOrganization(
    {
      ...nodeFields,
      status: searchScalar(z.enum(OrganizationStatus), z.enum(OrganizationStatus)),
      isVirtual: searchScalar(z.boolean(), z.boolean()),
      isEntity: searchScalar(z.boolean(), z.boolean()),
      path: searchCollection({
        ...nodeFields,
        distanceToTarget: searchScalar(
          z
            .number()
            .int()
            .min(0)
            .max(OrganizationLevel.Five - 1),
          z
            .number()
            .int()
            .min(0)
            .max(OrganizationLevel.Five - 1),
        ),
      }),
    },
    { valueSchema: queryString, pathField: "path", codeField: "code" },
  ),
});

export const OrganizationSearchDocumentSchema = createDocumentSchema(ORGANIZATION_SEARCH_STRUCTURE).superRefine(
  (document, context) => {
    const organization = document.organization;
    const path = organization.path;
    const self = path.at(-1);
    if (
      path.length !== organization.level ||
      path.some(
        (node, index) => node.level !== index + 1 || node.distanceToTarget !== organization.level - node.level,
      ) ||
      self?.code !== organization.code ||
      self.name !== organization.name ||
      self.type !== organization.type ||
      new Set(path.map((node) => node.code)).size !== path.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["organization", "path"],
        message: "组织路径必须完整、有序并包含一致的目标自身",
      });
    }
  },
);

export type OrganizationSearchDocument = z.infer<typeof OrganizationSearchDocumentSchema>;
