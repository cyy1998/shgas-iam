import * as z from 'zod';

export const DelegationDetailScalarFieldEnumSchema = z.enum(['delegationId', 'privilegeId'])

export type DelegationDetailScalarFieldEnum = z.infer<typeof DelegationDetailScalarFieldEnumSchema>;