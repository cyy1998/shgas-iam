import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { DelegationDetailWhereInputObjectSchema as DelegationDetailWhereInputObjectSchema } from './objects/DelegationDetailWhereInput.schema';

export const DelegationDetailDeleteManySchema: z.ZodType<Prisma.DelegationDetailDeleteManyArgs> = z.object({ where: DelegationDetailWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.DelegationDetailDeleteManyArgs>;

export const DelegationDetailDeleteManyZodSchema = z.object({ where: DelegationDetailWhereInputObjectSchema.optional() }).strict();