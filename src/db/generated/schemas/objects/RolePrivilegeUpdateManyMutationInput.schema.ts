import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  
}).strict();
export const RolePrivilegeUpdateManyMutationInputObjectSchema: z.ZodType<Prisma.RolePrivilegeUpdateManyMutationInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeUpdateManyMutationInput>;
export const RolePrivilegeUpdateManyMutationInputObjectZodSchema = makeSchema();
