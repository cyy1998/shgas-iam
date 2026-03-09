import { z } from '@hono/zod-openapi';

export const EmploymentOrderByRelevanceFieldEnumSchema = z.enum(['description'])

export type EmploymentOrderByRelevanceFieldEnum = z.infer<typeof EmploymentOrderByRelevanceFieldEnumSchema>;