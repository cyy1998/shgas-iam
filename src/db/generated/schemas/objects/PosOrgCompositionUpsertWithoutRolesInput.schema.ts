import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionUpdateWithoutRolesInputObjectSchema as PosOrgCompositionUpdateWithoutRolesInputObjectSchema } from './PosOrgCompositionUpdateWithoutRolesInput.schema';
import { PosOrgCompositionUncheckedUpdateWithoutRolesInputObjectSchema as PosOrgCompositionUncheckedUpdateWithoutRolesInputObjectSchema } from './PosOrgCompositionUncheckedUpdateWithoutRolesInput.schema';
import { PosOrgCompositionCreateWithoutRolesInputObjectSchema as PosOrgCompositionCreateWithoutRolesInputObjectSchema } from './PosOrgCompositionCreateWithoutRolesInput.schema';
import { PosOrgCompositionUncheckedCreateWithoutRolesInputObjectSchema as PosOrgCompositionUncheckedCreateWithoutRolesInputObjectSchema } from './PosOrgCompositionUncheckedCreateWithoutRolesInput.schema';
import { PosOrgCompositionWhereInputObjectSchema as PosOrgCompositionWhereInputObjectSchema } from './PosOrgCompositionWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => PosOrgCompositionUpdateWithoutRolesInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedUpdateWithoutRolesInputObjectSchema)]),
  create: z.union([z.lazy(() => PosOrgCompositionCreateWithoutRolesInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedCreateWithoutRolesInputObjectSchema)]),
  where: z.lazy(() => PosOrgCompositionWhereInputObjectSchema).optional()
}).strict();
export const PosOrgCompositionUpsertWithoutRolesInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUpsertWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUpsertWithoutRolesInput>;
export const PosOrgCompositionUpsertWithoutRolesInputObjectZodSchema = makeSchema();
