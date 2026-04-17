import * as z from 'zod';

export const PositionRoleScalarFieldEnumSchema = z.enum(['positionId', 'roleId'])

export type PositionRoleScalarFieldEnum = z.infer<typeof PositionRoleScalarFieldEnumSchema>;