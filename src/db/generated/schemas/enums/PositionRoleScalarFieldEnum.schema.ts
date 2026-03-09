import { z } from '@hono/zod-openapi';

export const PositionRoleScalarFieldEnumSchema = z.enum(['positionId', 'roleId'])

export type PositionRoleScalarFieldEnum = z.infer<typeof PositionRoleScalarFieldEnumSchema>;