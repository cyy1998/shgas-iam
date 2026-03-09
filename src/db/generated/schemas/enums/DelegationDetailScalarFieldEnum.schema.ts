import { z } from '@hono/zod-openapi';

export const DelegationDetailScalarFieldEnumSchema = z.enum(['delegationId', 'privilegeId'])

export type DelegationDetailScalarFieldEnum = z.infer<typeof DelegationDetailScalarFieldEnumSchema>;