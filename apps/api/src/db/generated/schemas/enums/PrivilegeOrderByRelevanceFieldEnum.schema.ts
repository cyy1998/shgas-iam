import * as z from 'zod';

export const PrivilegeOrderByRelevanceFieldEnumSchema = z.enum(['privilegeCode', 'privilegeName', 'description'])

export type PrivilegeOrderByRelevanceFieldEnum = z.infer<typeof PrivilegeOrderByRelevanceFieldEnumSchema>;