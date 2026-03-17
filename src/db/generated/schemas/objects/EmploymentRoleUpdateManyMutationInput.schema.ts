import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  
}).strict();
export const EmploymentRoleUpdateManyMutationInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUpdateManyMutationInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUpdateManyMutationInput>;
export const EmploymentRoleUpdateManyMutationInputObjectZodSchema = makeSchema();
