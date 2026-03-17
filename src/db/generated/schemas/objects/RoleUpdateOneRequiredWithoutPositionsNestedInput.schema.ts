import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleCreateWithoutPositionsInputObjectSchema as RoleCreateWithoutPositionsInputObjectSchema } from './RoleCreateWithoutPositionsInput.schema';
import { RoleUncheckedCreateWithoutPositionsInputObjectSchema as RoleUncheckedCreateWithoutPositionsInputObjectSchema } from './RoleUncheckedCreateWithoutPositionsInput.schema';
import { RoleCreateOrConnectWithoutPositionsInputObjectSchema as RoleCreateOrConnectWithoutPositionsInputObjectSchema } from './RoleCreateOrConnectWithoutPositionsInput.schema';
import { RoleUpsertWithoutPositionsInputObjectSchema as RoleUpsertWithoutPositionsInputObjectSchema } from './RoleUpsertWithoutPositionsInput.schema';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './RoleWhereUniqueInput.schema';
import { RoleUpdateToOneWithWhereWithoutPositionsInputObjectSchema as RoleUpdateToOneWithWhereWithoutPositionsInputObjectSchema } from './RoleUpdateToOneWithWhereWithoutPositionsInput.schema';
import { RoleUpdateWithoutPositionsInputObjectSchema as RoleUpdateWithoutPositionsInputObjectSchema } from './RoleUpdateWithoutPositionsInput.schema';
import { RoleUncheckedUpdateWithoutPositionsInputObjectSchema as RoleUncheckedUpdateWithoutPositionsInputObjectSchema } from './RoleUncheckedUpdateWithoutPositionsInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => RoleCreateWithoutPositionsInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutPositionsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => RoleCreateOrConnectWithoutPositionsInputObjectSchema).optional(),
  upsert: z.lazy(() => RoleUpsertWithoutPositionsInputObjectSchema).optional(),
  connect: z.lazy(() => RoleWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => RoleUpdateToOneWithWhereWithoutPositionsInputObjectSchema), z.lazy(() => RoleUpdateWithoutPositionsInputObjectSchema), z.lazy(() => RoleUncheckedUpdateWithoutPositionsInputObjectSchema)]).optional()
}).strict();
export const RoleUpdateOneRequiredWithoutPositionsNestedInputObjectSchema: z.ZodType<Prisma.RoleUpdateOneRequiredWithoutPositionsNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUpdateOneRequiredWithoutPositionsNestedInput>;
export const RoleUpdateOneRequiredWithoutPositionsNestedInputObjectZodSchema = makeSchema();
