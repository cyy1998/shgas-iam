import * as z from 'zod';

export const OrganizationOrderByRelevanceFieldEnumSchema = z.enum(['orgCode', 'orgName', 'path', 'orgType'])

export type OrganizationOrderByRelevanceFieldEnum = z.infer<typeof OrganizationOrderByRelevanceFieldEnumSchema>;