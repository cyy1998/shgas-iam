import * as z from 'zod';

export const PositionOrderByRelevanceFieldEnumSchema = z.enum(['posCode', 'posName', 'description'])

export type PositionOrderByRelevanceFieldEnum = z.infer<typeof PositionOrderByRelevanceFieldEnumSchema>;