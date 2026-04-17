import * as z from 'zod';

export const ClientOrderByRelevanceFieldEnumSchema = z.enum(['clientCode', 'clientName', 'clientSecret', 'url', 'description'])

export type ClientOrderByRelevanceFieldEnum = z.infer<typeof ClientOrderByRelevanceFieldEnumSchema>;