import { z } from '@hono/zod-openapi';

export const ClientOrderByRelevanceFieldEnumSchema = z.enum(['clientCode', 'clientName', 'url', 'description'])

export type ClientOrderByRelevanceFieldEnum = z.infer<typeof ClientOrderByRelevanceFieldEnumSchema>;