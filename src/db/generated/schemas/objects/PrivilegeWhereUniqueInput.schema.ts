import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  privilegeCode: z.string().optional()
}).strict();
export const PrivilegeWhereUniqueInputObjectSchema: z.ZodType<Prisma.PrivilegeWhereUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeWhereUniqueInput>;
export const PrivilegeWhereUniqueInputObjectZodSchema = makeSchema();
