import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionCreateWithoutRolesInputObjectSchema as PosOrgCompositionCreateWithoutRolesInputObjectSchema } from './PosOrgCompositionCreateWithoutRolesInput.schema';
import { PosOrgCompositionUncheckedCreateWithoutRolesInputObjectSchema as PosOrgCompositionUncheckedCreateWithoutRolesInputObjectSchema } from './PosOrgCompositionUncheckedCreateWithoutRolesInput.schema';
import { PosOrgCompositionCreateOrConnectWithoutRolesInputObjectSchema as PosOrgCompositionCreateOrConnectWithoutRolesInputObjectSchema } from './PosOrgCompositionCreateOrConnectWithoutRolesInput.schema';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './PosOrgCompositionWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PosOrgCompositionCreateWithoutRolesInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedCreateWithoutRolesInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => PosOrgCompositionCreateOrConnectWithoutRolesInputObjectSchema).optional(),
  connect: z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema).optional()
}).strict();
export const PosOrgCompositionCreateNestedOneWithoutRolesInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionCreateNestedOneWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionCreateNestedOneWithoutRolesInput>;
export const PosOrgCompositionCreateNestedOneWithoutRolesInputObjectZodSchema = makeSchema();
