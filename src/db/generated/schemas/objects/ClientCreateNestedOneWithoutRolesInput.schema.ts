import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { ClientCreateWithoutRolesInputObjectSchema as ClientCreateWithoutRolesInputObjectSchema } from './ClientCreateWithoutRolesInput.schema';
import { ClientUncheckedCreateWithoutRolesInputObjectSchema as ClientUncheckedCreateWithoutRolesInputObjectSchema } from './ClientUncheckedCreateWithoutRolesInput.schema';
import { ClientCreateOrConnectWithoutRolesInputObjectSchema as ClientCreateOrConnectWithoutRolesInputObjectSchema } from './ClientCreateOrConnectWithoutRolesInput.schema';
import { ClientWhereUniqueInputObjectSchema as ClientWhereUniqueInputObjectSchema } from './ClientWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => ClientCreateWithoutRolesInputObjectSchema), z.lazy(() => ClientUncheckedCreateWithoutRolesInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => ClientCreateOrConnectWithoutRolesInputObjectSchema).optional(),
  connect: z.lazy(() => ClientWhereUniqueInputObjectSchema).optional()
}).strict();
export const ClientCreateNestedOneWithoutRolesInputObjectSchema: z.ZodType<Prisma.ClientCreateNestedOneWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.ClientCreateNestedOneWithoutRolesInput>;
export const ClientCreateNestedOneWithoutRolesInputObjectZodSchema = makeSchema();
