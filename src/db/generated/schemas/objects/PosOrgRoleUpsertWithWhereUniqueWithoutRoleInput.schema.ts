import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './PosOrgRoleWhereUniqueInput.schema';
import { PosOrgRoleUpdateWithoutRoleInputObjectSchema as PosOrgRoleUpdateWithoutRoleInputObjectSchema } from './PosOrgRoleUpdateWithoutRoleInput.schema';
import { PosOrgRoleUncheckedUpdateWithoutRoleInputObjectSchema as PosOrgRoleUncheckedUpdateWithoutRoleInputObjectSchema } from './PosOrgRoleUncheckedUpdateWithoutRoleInput.schema';
import { PosOrgRoleCreateWithoutRoleInputObjectSchema as PosOrgRoleCreateWithoutRoleInputObjectSchema } from './PosOrgRoleCreateWithoutRoleInput.schema';
import { PosOrgRoleUncheckedCreateWithoutRoleInputObjectSchema as PosOrgRoleUncheckedCreateWithoutRoleInputObjectSchema } from './PosOrgRoleUncheckedCreateWithoutRoleInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => PosOrgRoleUpdateWithoutRoleInputObjectSchema), z.lazy(() => PosOrgRoleUncheckedUpdateWithoutRoleInputObjectSchema)]),
  create: z.union([z.lazy(() => PosOrgRoleCreateWithoutRoleInputObjectSchema), z.lazy(() => PosOrgRoleUncheckedCreateWithoutRoleInputObjectSchema)])
}).strict();
export const PosOrgRoleUpsertWithWhereUniqueWithoutRoleInputObjectSchema: z.ZodType<Prisma.PosOrgRoleUpsertWithWhereUniqueWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleUpsertWithWhereUniqueWithoutRoleInput>;
export const PosOrgRoleUpsertWithWhereUniqueWithoutRoleInputObjectZodSchema = makeSchema();
