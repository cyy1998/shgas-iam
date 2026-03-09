import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PositionRoleCreateManyInputObjectSchema as PositionRoleCreateManyInputObjectSchema } from './objects/PositionRoleCreateManyInput.schema';

export const PositionRoleCreateManySchema: z.ZodType<Prisma.PositionRoleCreateManyArgs> = z.object({ data: z.union([ PositionRoleCreateManyInputObjectSchema, z.array(PositionRoleCreateManyInputObjectSchema) ]),  }).strict() as unknown as z.ZodType<Prisma.PositionRoleCreateManyArgs>;

export const PositionRoleCreateManyZodSchema = z.object({ data: z.union([ PositionRoleCreateManyInputObjectSchema, z.array(PositionRoleCreateManyInputObjectSchema) ]),  }).strict();