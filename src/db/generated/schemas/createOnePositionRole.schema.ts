import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PositionRoleUncheckedCreateInputObjectSchema as PositionRoleUncheckedCreateInputObjectSchema } from './objects/PositionRoleUncheckedCreateInput.schema';

export const PositionRoleCreateOneSchema: z.ZodType<Prisma.PositionRoleCreateArgs> = z.object({   data: PositionRoleUncheckedCreateInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PositionRoleCreateArgs>;

export const PositionRoleCreateOneZodSchema = z.object({   data: PositionRoleUncheckedCreateInputObjectSchema }).strict();