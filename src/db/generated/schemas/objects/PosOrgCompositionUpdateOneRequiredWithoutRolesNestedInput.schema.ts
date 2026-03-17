import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionCreateWithoutRolesInputObjectSchema as PosOrgCompositionCreateWithoutRolesInputObjectSchema } from './PosOrgCompositionCreateWithoutRolesInput.schema';
import { PosOrgCompositionUncheckedCreateWithoutRolesInputObjectSchema as PosOrgCompositionUncheckedCreateWithoutRolesInputObjectSchema } from './PosOrgCompositionUncheckedCreateWithoutRolesInput.schema';
import { PosOrgCompositionCreateOrConnectWithoutRolesInputObjectSchema as PosOrgCompositionCreateOrConnectWithoutRolesInputObjectSchema } from './PosOrgCompositionCreateOrConnectWithoutRolesInput.schema';
import { PosOrgCompositionUpsertWithoutRolesInputObjectSchema as PosOrgCompositionUpsertWithoutRolesInputObjectSchema } from './PosOrgCompositionUpsertWithoutRolesInput.schema';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './PosOrgCompositionWhereUniqueInput.schema';
import { PosOrgCompositionUpdateToOneWithWhereWithoutRolesInputObjectSchema as PosOrgCompositionUpdateToOneWithWhereWithoutRolesInputObjectSchema } from './PosOrgCompositionUpdateToOneWithWhereWithoutRolesInput.schema';
import { PosOrgCompositionUpdateWithoutRolesInputObjectSchema as PosOrgCompositionUpdateWithoutRolesInputObjectSchema } from './PosOrgCompositionUpdateWithoutRolesInput.schema';
import { PosOrgCompositionUncheckedUpdateWithoutRolesInputObjectSchema as PosOrgCompositionUncheckedUpdateWithoutRolesInputObjectSchema } from './PosOrgCompositionUncheckedUpdateWithoutRolesInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PosOrgCompositionCreateWithoutRolesInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedCreateWithoutRolesInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => PosOrgCompositionCreateOrConnectWithoutRolesInputObjectSchema).optional(),
  upsert: z.lazy(() => PosOrgCompositionUpsertWithoutRolesInputObjectSchema).optional(),
  connect: z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => PosOrgCompositionUpdateToOneWithWhereWithoutRolesInputObjectSchema), z.lazy(() => PosOrgCompositionUpdateWithoutRolesInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedUpdateWithoutRolesInputObjectSchema)]).optional()
}).strict();
export const PosOrgCompositionUpdateOneRequiredWithoutRolesNestedInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUpdateOneRequiredWithoutRolesNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUpdateOneRequiredWithoutRolesNestedInput>;
export const PosOrgCompositionUpdateOneRequiredWithoutRolesNestedInputObjectZodSchema = makeSchema();
