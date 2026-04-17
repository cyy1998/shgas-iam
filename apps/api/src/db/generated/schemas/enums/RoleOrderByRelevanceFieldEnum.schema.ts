import * as z from 'zod';

export const RoleOrderByRelevanceFieldEnumSchema = z.enum(['roleCode', 'roleName', 'description'])

export type RoleOrderByRelevanceFieldEnum = z.infer<typeof RoleOrderByRelevanceFieldEnumSchema>;