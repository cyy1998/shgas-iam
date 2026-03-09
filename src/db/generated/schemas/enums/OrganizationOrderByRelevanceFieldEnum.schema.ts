import { z } from '@hono/zod-openapi';

export const OrganizationOrderByRelevanceFieldEnumSchema = z.enum(['orgCode', 'orgName', 'path', 'orgType'])

export type OrganizationOrderByRelevanceFieldEnum = z.infer<typeof OrganizationOrderByRelevanceFieldEnumSchema>;