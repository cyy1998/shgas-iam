import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailWhereInputObjectSchema as DelegationDetailWhereInputObjectSchema } from './DelegationDetailWhereInput.schema'

const makeSchema = () => z.object({
  every: z.lazy(() => DelegationDetailWhereInputObjectSchema).optional(),
  some: z.lazy(() => DelegationDetailWhereInputObjectSchema).optional(),
  none: z.lazy(() => DelegationDetailWhereInputObjectSchema).optional()
}).strict();
export const DelegationDetailListRelationFilterObjectSchema: z.ZodType<Prisma.DelegationDetailListRelationFilter> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailListRelationFilter>;
export const DelegationDetailListRelationFilterObjectZodSchema = makeSchema();
