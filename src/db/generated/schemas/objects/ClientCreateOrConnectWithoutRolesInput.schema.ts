import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { ClientWhereUniqueInputObjectSchema as ClientWhereUniqueInputObjectSchema } from './ClientWhereUniqueInput.schema';
import { ClientCreateWithoutRolesInputObjectSchema as ClientCreateWithoutRolesInputObjectSchema } from './ClientCreateWithoutRolesInput.schema';
import { ClientUncheckedCreateWithoutRolesInputObjectSchema as ClientUncheckedCreateWithoutRolesInputObjectSchema } from './ClientUncheckedCreateWithoutRolesInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => ClientWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => ClientCreateWithoutRolesInputObjectSchema), z.lazy(() => ClientUncheckedCreateWithoutRolesInputObjectSchema)])
}).strict();
export const ClientCreateOrConnectWithoutRolesInputObjectSchema: z.ZodType<Prisma.ClientCreateOrConnectWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.ClientCreateOrConnectWithoutRolesInput>;
export const ClientCreateOrConnectWithoutRolesInputObjectZodSchema = makeSchema();
