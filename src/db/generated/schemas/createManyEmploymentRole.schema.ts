import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { EmploymentRoleCreateManyInputObjectSchema as EmploymentRoleCreateManyInputObjectSchema } from './objects/EmploymentRoleCreateManyInput.schema';

export const EmploymentRoleCreateManySchema: z.ZodType<Prisma.EmploymentRoleCreateManyArgs> = z.object({ data: z.union([ EmploymentRoleCreateManyInputObjectSchema, z.array(EmploymentRoleCreateManyInputObjectSchema) ]),  }).strict() as unknown as z.ZodType<Prisma.EmploymentRoleCreateManyArgs>;

export const EmploymentRoleCreateManyZodSchema = z.object({ data: z.union([ EmploymentRoleCreateManyInputObjectSchema, z.array(EmploymentRoleCreateManyInputObjectSchema) ]),  }).strict();