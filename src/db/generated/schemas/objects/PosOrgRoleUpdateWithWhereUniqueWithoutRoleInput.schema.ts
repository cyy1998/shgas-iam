import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './PosOrgRoleWhereUniqueInput.schema';
import { PosOrgRoleUpdateWithoutRoleInputObjectSchema as PosOrgRoleUpdateWithoutRoleInputObjectSchema } from './PosOrgRoleUpdateWithoutRoleInput.schema';
import { PosOrgRoleUncheckedUpdateWithoutRoleInputObjectSchema as PosOrgRoleUncheckedUpdateWithoutRoleInputObjectSchema } from './PosOrgRoleUncheckedUpdateWithoutRoleInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => PosOrgRoleUpdateWithoutRoleInputObjectSchema), z.lazy(() => PosOrgRoleUncheckedUpdateWithoutRoleInputObjectSchema)])
}).strict();
export const PosOrgRoleUpdateWithWhereUniqueWithoutRoleInputObjectSchema: z.ZodType<Prisma.PosOrgRoleUpdateWithWhereUniqueWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleUpdateWithWhereUniqueWithoutRoleInput>;
export const PosOrgRoleUpdateWithWhereUniqueWithoutRoleInputObjectZodSchema = makeSchema();
