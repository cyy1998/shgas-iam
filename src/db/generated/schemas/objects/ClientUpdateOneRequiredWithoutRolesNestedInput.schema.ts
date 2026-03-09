import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { ClientCreateWithoutRolesInputObjectSchema as ClientCreateWithoutRolesInputObjectSchema } from './ClientCreateWithoutRolesInput.schema';
import { ClientUncheckedCreateWithoutRolesInputObjectSchema as ClientUncheckedCreateWithoutRolesInputObjectSchema } from './ClientUncheckedCreateWithoutRolesInput.schema';
import { ClientCreateOrConnectWithoutRolesInputObjectSchema as ClientCreateOrConnectWithoutRolesInputObjectSchema } from './ClientCreateOrConnectWithoutRolesInput.schema';
import { ClientUpsertWithoutRolesInputObjectSchema as ClientUpsertWithoutRolesInputObjectSchema } from './ClientUpsertWithoutRolesInput.schema';
import { ClientWhereUniqueInputObjectSchema as ClientWhereUniqueInputObjectSchema } from './ClientWhereUniqueInput.schema';
import { ClientUpdateToOneWithWhereWithoutRolesInputObjectSchema as ClientUpdateToOneWithWhereWithoutRolesInputObjectSchema } from './ClientUpdateToOneWithWhereWithoutRolesInput.schema';
import { ClientUpdateWithoutRolesInputObjectSchema as ClientUpdateWithoutRolesInputObjectSchema } from './ClientUpdateWithoutRolesInput.schema';
import { ClientUncheckedUpdateWithoutRolesInputObjectSchema as ClientUncheckedUpdateWithoutRolesInputObjectSchema } from './ClientUncheckedUpdateWithoutRolesInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => ClientCreateWithoutRolesInputObjectSchema), z.lazy(() => ClientUncheckedCreateWithoutRolesInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => ClientCreateOrConnectWithoutRolesInputObjectSchema).optional(),
  upsert: z.lazy(() => ClientUpsertWithoutRolesInputObjectSchema).optional(),
  connect: z.lazy(() => ClientWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => ClientUpdateToOneWithWhereWithoutRolesInputObjectSchema), z.lazy(() => ClientUpdateWithoutRolesInputObjectSchema), z.lazy(() => ClientUncheckedUpdateWithoutRolesInputObjectSchema)]).optional()
}).strict();
export const ClientUpdateOneRequiredWithoutRolesNestedInputObjectSchema: z.ZodType<Prisma.ClientUpdateOneRequiredWithoutRolesNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.ClientUpdateOneRequiredWithoutRolesNestedInput>;
export const ClientUpdateOneRequiredWithoutRolesNestedInputObjectZodSchema = makeSchema();
