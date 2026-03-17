import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionWhereInputObjectSchema as PosOrgCompositionWhereInputObjectSchema } from './PosOrgCompositionWhereInput.schema';
import { PosOrgCompositionUpdateWithoutRolesInputObjectSchema as PosOrgCompositionUpdateWithoutRolesInputObjectSchema } from './PosOrgCompositionUpdateWithoutRolesInput.schema';
import { PosOrgCompositionUncheckedUpdateWithoutRolesInputObjectSchema as PosOrgCompositionUncheckedUpdateWithoutRolesInputObjectSchema } from './PosOrgCompositionUncheckedUpdateWithoutRolesInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgCompositionWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => PosOrgCompositionUpdateWithoutRolesInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedUpdateWithoutRolesInputObjectSchema)])
}).strict();
export const PosOrgCompositionUpdateToOneWithWhereWithoutRolesInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUpdateToOneWithWhereWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUpdateToOneWithWhereWithoutRolesInput>;
export const PosOrgCompositionUpdateToOneWithWhereWithoutRolesInputObjectZodSchema = makeSchema();
