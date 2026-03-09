import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { EmploymentSelectObjectSchema as EmploymentSelectObjectSchema } from './objects/EmploymentSelect.schema';
import { EmploymentIncludeObjectSchema as EmploymentIncludeObjectSchema } from './objects/EmploymentInclude.schema';
import { EmploymentCreateInputObjectSchema as EmploymentCreateInputObjectSchema } from './objects/EmploymentCreateInput.schema';
import { EmploymentUncheckedCreateInputObjectSchema as EmploymentUncheckedCreateInputObjectSchema } from './objects/EmploymentUncheckedCreateInput.schema';

export const EmploymentCreateOneSchema: z.ZodType<Prisma.EmploymentCreateArgs> = z.object({ select: EmploymentSelectObjectSchema.optional(), include: EmploymentIncludeObjectSchema.optional(), data: z.union([EmploymentCreateInputObjectSchema, EmploymentUncheckedCreateInputObjectSchema]) }).strict() as unknown as z.ZodType<Prisma.EmploymentCreateArgs>;

export const EmploymentCreateOneZodSchema = z.object({ select: EmploymentSelectObjectSchema.optional(), include: EmploymentIncludeObjectSchema.optional(), data: z.union([EmploymentCreateInputObjectSchema, EmploymentUncheckedCreateInputObjectSchema]) }).strict();