import { z } from '@hono/zod-openapi';

export const PrivilegeDelegationOrderByRelevanceFieldEnumSchema = z.enum(['description'])

export type PrivilegeDelegationOrderByRelevanceFieldEnum = z.infer<typeof PrivilegeDelegationOrderByRelevanceFieldEnumSchema>;