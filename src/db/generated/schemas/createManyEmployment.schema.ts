import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { EmploymentCreateManyInputObjectSchema as EmploymentCreateManyInputObjectSchema } from './objects/EmploymentCreateManyInput.schema';

export const EmploymentCreateManySchema: z.ZodType<Prisma.EmploymentCreateManyArgs> = z.object({ data: z.union([ EmploymentCreateManyInputObjectSchema, z.array(EmploymentCreateManyInputObjectSchema) ]),  }).strict() as unknown as z.ZodType<Prisma.EmploymentCreateManyArgs>;

export const EmploymentCreateManyZodSchema = z.object({ data: z.union([ EmploymentCreateManyInputObjectSchema, z.array(EmploymentCreateManyInputObjectSchema) ]),  }).strict();