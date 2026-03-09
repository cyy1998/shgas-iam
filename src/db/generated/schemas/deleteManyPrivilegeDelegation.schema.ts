import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PrivilegeDelegationWhereInputObjectSchema as PrivilegeDelegationWhereInputObjectSchema } from './objects/PrivilegeDelegationWhereInput.schema';

export const PrivilegeDelegationDeleteManySchema: z.ZodType<Prisma.PrivilegeDelegationDeleteManyArgs> = z.object({ where: PrivilegeDelegationWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.PrivilegeDelegationDeleteManyArgs>;

export const PrivilegeDelegationDeleteManyZodSchema = z.object({ where: PrivilegeDelegationWhereInputObjectSchema.optional() }).strict();