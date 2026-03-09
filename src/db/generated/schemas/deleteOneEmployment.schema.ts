import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { EmploymentSelectObjectSchema as EmploymentSelectObjectSchema } from './objects/EmploymentSelect.schema';
import { EmploymentIncludeObjectSchema as EmploymentIncludeObjectSchema } from './objects/EmploymentInclude.schema';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './objects/EmploymentWhereUniqueInput.schema';

export const EmploymentDeleteOneSchema: z.ZodType<Prisma.EmploymentDeleteArgs> = z.object({ select: EmploymentSelectObjectSchema.optional(), include: EmploymentIncludeObjectSchema.optional(), where: EmploymentWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.EmploymentDeleteArgs>;

export const EmploymentDeleteOneZodSchema = z.object({ select: EmploymentSelectObjectSchema.optional(), include: EmploymentIncludeObjectSchema.optional(), where: EmploymentWhereUniqueInputObjectSchema }).strict();