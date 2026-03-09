import { z } from '@hono/zod-openapi';

export const PosOrgCompositionOrderByRelevanceFieldEnumSchema = z.enum(['description'])

export type PosOrgCompositionOrderByRelevanceFieldEnum = z.infer<typeof PosOrgCompositionOrderByRelevanceFieldEnumSchema>;