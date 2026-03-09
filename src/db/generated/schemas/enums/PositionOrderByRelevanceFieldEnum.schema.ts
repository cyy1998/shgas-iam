import { z } from '@hono/zod-openapi';

export const PositionOrderByRelevanceFieldEnumSchema = z.enum(['posCode', 'posName', 'description'])

export type PositionOrderByRelevanceFieldEnum = z.infer<typeof PositionOrderByRelevanceFieldEnumSchema>;