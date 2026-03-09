import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema'

const delegationdetailscalarwhereinputSchema = z.object({
  AND: z.union([z.lazy(() => DelegationDetailScalarWhereInputObjectSchema), z.lazy(() => DelegationDetailScalarWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => DelegationDetailScalarWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => DelegationDetailScalarWhereInputObjectSchema), z.lazy(() => DelegationDetailScalarWhereInputObjectSchema).array()]).optional(),
  delegationId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  privilegeId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional()
}).strict();
export const DelegationDetailScalarWhereInputObjectSchema: z.ZodType<Prisma.DelegationDetailScalarWhereInput> = delegationdetailscalarwhereinputSchema as unknown as z.ZodType<Prisma.DelegationDetailScalarWhereInput>;
export const DelegationDetailScalarWhereInputObjectZodSchema = delegationdetailscalarwhereinputSchema;
