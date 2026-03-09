import { z } from '@hono/zod-openapi';

export const RoleOrderByRelevanceFieldEnumSchema = z.enum(['roleCode', 'roleName', 'description'])

export type RoleOrderByRelevanceFieldEnum = z.infer<typeof RoleOrderByRelevanceFieldEnumSchema>;