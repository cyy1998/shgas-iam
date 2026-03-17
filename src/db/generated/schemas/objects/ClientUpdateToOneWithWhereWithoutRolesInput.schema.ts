import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { ClientWhereInputObjectSchema as ClientWhereInputObjectSchema } from './ClientWhereInput.schema';
import { ClientUpdateWithoutRolesInputObjectSchema as ClientUpdateWithoutRolesInputObjectSchema } from './ClientUpdateWithoutRolesInput.schema';
import { ClientUncheckedUpdateWithoutRolesInputObjectSchema as ClientUncheckedUpdateWithoutRolesInputObjectSchema } from './ClientUncheckedUpdateWithoutRolesInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => ClientWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => ClientUpdateWithoutRolesInputObjectSchema), z.lazy(() => ClientUncheckedUpdateWithoutRolesInputObjectSchema)])
}).strict();
export const ClientUpdateToOneWithWhereWithoutRolesInputObjectSchema: z.ZodType<Prisma.ClientUpdateToOneWithWhereWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.ClientUpdateToOneWithWhereWithoutRolesInput>;
export const ClientUpdateToOneWithWhereWithoutRolesInputObjectZodSchema = makeSchema();
