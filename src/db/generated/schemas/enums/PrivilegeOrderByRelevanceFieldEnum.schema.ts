import { z } from '@hono/zod-openapi';

export const PrivilegeOrderByRelevanceFieldEnumSchema = z.enum(['privilegeCode', 'privilegeName', 'description'])

export type PrivilegeOrderByRelevanceFieldEnum = z.infer<typeof PrivilegeOrderByRelevanceFieldEnumSchema>;