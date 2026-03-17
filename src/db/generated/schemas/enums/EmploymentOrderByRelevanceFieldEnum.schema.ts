import * as z from 'zod';

export const EmploymentOrderByRelevanceFieldEnumSchema = z.enum(['description'])

export type EmploymentOrderByRelevanceFieldEnum = z.infer<typeof EmploymentOrderByRelevanceFieldEnumSchema>;