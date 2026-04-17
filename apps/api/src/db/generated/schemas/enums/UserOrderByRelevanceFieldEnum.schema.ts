import * as z from 'zod';

export const UserOrderByRelevanceFieldEnumSchema = z.enum(['username', 'wxId', 'name', 'password', 'mobile', 'userType'])

export type UserOrderByRelevanceFieldEnum = z.infer<typeof UserOrderByRelevanceFieldEnumSchema>;