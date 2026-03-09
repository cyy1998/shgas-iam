import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionCreateWithoutRolesInputObjectSchema as PositionCreateWithoutRolesInputObjectSchema } from './PositionCreateWithoutRolesInput.schema';
import { PositionUncheckedCreateWithoutRolesInputObjectSchema as PositionUncheckedCreateWithoutRolesInputObjectSchema } from './PositionUncheckedCreateWithoutRolesInput.schema';
import { PositionCreateOrConnectWithoutRolesInputObjectSchema as PositionCreateOrConnectWithoutRolesInputObjectSchema } from './PositionCreateOrConnectWithoutRolesInput.schema';
import { PositionUpsertWithoutRolesInputObjectSchema as PositionUpsertWithoutRolesInputObjectSchema } from './PositionUpsertWithoutRolesInput.schema';
import { PositionWhereUniqueInputObjectSchema as PositionWhereUniqueInputObjectSchema } from './PositionWhereUniqueInput.schema';
import { PositionUpdateToOneWithWhereWithoutRolesInputObjectSchema as PositionUpdateToOneWithWhereWithoutRolesInputObjectSchema } from './PositionUpdateToOneWithWhereWithoutRolesInput.schema';
import { PositionUpdateWithoutRolesInputObjectSchema as PositionUpdateWithoutRolesInputObjectSchema } from './PositionUpdateWithoutRolesInput.schema';
import { PositionUncheckedUpdateWithoutRolesInputObjectSchema as PositionUncheckedUpdateWithoutRolesInputObjectSchema } from './PositionUncheckedUpdateWithoutRolesInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PositionCreateWithoutRolesInputObjectSchema), z.lazy(() => PositionUncheckedCreateWithoutRolesInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => PositionCreateOrConnectWithoutRolesInputObjectSchema).optional(),
  upsert: z.lazy(() => PositionUpsertWithoutRolesInputObjectSchema).optional(),
  connect: z.lazy(() => PositionWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => PositionUpdateToOneWithWhereWithoutRolesInputObjectSchema), z.lazy(() => PositionUpdateWithoutRolesInputObjectSchema), z.lazy(() => PositionUncheckedUpdateWithoutRolesInputObjectSchema)]).optional()
}).strict();
export const PositionUpdateOneRequiredWithoutRolesNestedInputObjectSchema: z.ZodType<Prisma.PositionUpdateOneRequiredWithoutRolesNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionUpdateOneRequiredWithoutRolesNestedInput>;
export const PositionUpdateOneRequiredWithoutRolesNestedInputObjectZodSchema = makeSchema();
