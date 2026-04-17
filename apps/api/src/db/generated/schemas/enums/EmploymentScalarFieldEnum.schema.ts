import * as z from 'zod';

export const EmploymentScalarFieldEnumSchema = z.enum(['id', 'userId', 'posId', 'orgId', 'compId', 'isPrimary', 'status', 'startTime', 'endTime', 'description', 'isDelete', 'createTime', 'updateTime'])

export type EmploymentScalarFieldEnum = z.infer<typeof EmploymentScalarFieldEnumSchema>;