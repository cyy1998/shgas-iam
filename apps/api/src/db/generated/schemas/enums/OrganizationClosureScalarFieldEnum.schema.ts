import * as z from 'zod';

export const OrganizationClosureScalarFieldEnumSchema = z.enum(['id', 'ancestorId', 'descendantId', 'depth'])

export type OrganizationClosureScalarFieldEnum = z.infer<typeof OrganizationClosureScalarFieldEnumSchema>;