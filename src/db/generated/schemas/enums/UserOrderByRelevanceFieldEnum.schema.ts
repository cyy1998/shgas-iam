import { z } from '@hono/zod-openapi';

export const UserOrderByRelevanceFieldEnumSchema = z.enum(['username', 'wxId', 'name', 'password', 'mobile', 'userType'])

export type UserOrderByRelevanceFieldEnum = z.infer<typeof UserOrderByRelevanceFieldEnumSchema>;