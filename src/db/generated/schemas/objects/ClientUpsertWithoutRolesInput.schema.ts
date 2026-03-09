import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { ClientUpdateWithoutRolesInputObjectSchema as ClientUpdateWithoutRolesInputObjectSchema } from './ClientUpdateWithoutRolesInput.schema';
import { ClientUncheckedUpdateWithoutRolesInputObjectSchema as ClientUncheckedUpdateWithoutRolesInputObjectSchema } from './ClientUncheckedUpdateWithoutRolesInput.schema';
import { ClientCreateWithoutRolesInputObjectSchema as ClientCreateWithoutRolesInputObjectSchema } from './ClientCreateWithoutRolesInput.schema';
import { ClientUncheckedCreateWithoutRolesInputObjectSchema as ClientUncheckedCreateWithoutRolesInputObjectSchema } from './ClientUncheckedCreateWithoutRolesInput.schema';
import { ClientWhereInputObjectSchema as ClientWhereInputObjectSchema } from './ClientWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => ClientUpdateWithoutRolesInputObjectSchema), z.lazy(() => ClientUncheckedUpdateWithoutRolesInputObjectSchema)]),
  create: z.union([z.lazy(() => ClientCreateWithoutRolesInputObjectSchema), z.lazy(() => ClientUncheckedCreateWithoutRolesInputObjectSchema)]),
  where: z.lazy(() => ClientWhereInputObjectSchema).optional()
}).strict();
export const ClientUpsertWithoutRolesInputObjectSchema: z.ZodType<Prisma.ClientUpsertWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.ClientUpsertWithoutRolesInput>;
export const ClientUpsertWithoutRolesInputObjectZodSchema = makeSchema();
