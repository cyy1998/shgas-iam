import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  
}).strict();
export const PositionRoleUpdateManyMutationInputObjectSchema: z.ZodType<Prisma.PositionRoleUpdateManyMutationInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUpdateManyMutationInput>;
export const PositionRoleUpdateManyMutationInputObjectZodSchema = makeSchema();
