import * as z from 'zod';

export const PosOrgCompositionOrderByRelevanceFieldEnumSchema = z.enum(['description'])

export type PosOrgCompositionOrderByRelevanceFieldEnum = z.infer<typeof PosOrgCompositionOrderByRelevanceFieldEnumSchema>;