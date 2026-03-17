import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  
}).strict();
export const PosOrgRoleUpdateManyMutationInputObjectSchema: z.ZodType<Prisma.PosOrgRoleUpdateManyMutationInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleUpdateManyMutationInput>;
export const PosOrgRoleUpdateManyMutationInputObjectZodSchema = makeSchema();
