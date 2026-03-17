import * as z from 'zod';

export const PositionScalarFieldEnumSchema = z.enum(['id', 'posCode', 'posName', 'status', 'description', 'isDelete', 'createTime', 'updateTime'])

export type PositionScalarFieldEnum = z.infer<typeof PositionScalarFieldEnumSchema>;