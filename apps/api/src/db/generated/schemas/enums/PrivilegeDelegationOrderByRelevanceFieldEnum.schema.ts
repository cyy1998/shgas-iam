import * as z from 'zod';

export const PrivilegeDelegationOrderByRelevanceFieldEnumSchema = z.enum(['description'])

export type PrivilegeDelegationOrderByRelevanceFieldEnum = z.infer<typeof PrivilegeDelegationOrderByRelevanceFieldEnumSchema>;