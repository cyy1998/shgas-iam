import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { EmploymentUpdateManyMutationInputObjectSchema as EmploymentUpdateManyMutationInputObjectSchema } from './objects/EmploymentUpdateManyMutationInput.schema';
import { EmploymentWhereInputObjectSchema as EmploymentWhereInputObjectSchema } from './objects/EmploymentWhereInput.schema';

export const EmploymentUpdateManySchema: z.ZodType<Prisma.EmploymentUpdateManyArgs> = z.object({ data: EmploymentUpdateManyMutationInputObjectSchema, where: EmploymentWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.EmploymentUpdateManyArgs>;

export const EmploymentUpdateManyZodSchema = z.object({ data: EmploymentUpdateManyMutationInputObjectSchema, where: EmploymentWhereInputObjectSchema.optional() }).strict();