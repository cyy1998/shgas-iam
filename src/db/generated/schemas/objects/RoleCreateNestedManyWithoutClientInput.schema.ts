import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleCreateWithoutClientInputObjectSchema as RoleCreateWithoutClientInputObjectSchema } from './RoleCreateWithoutClientInput.schema';
import { RoleUncheckedCreateWithoutClientInputObjectSchema as RoleUncheckedCreateWithoutClientInputObjectSchema } from './RoleUncheckedCreateWithoutClientInput.schema';
import { RoleCreateOrConnectWithoutClientInputObjectSchema as RoleCreateOrConnectWithoutClientInputObjectSchema } from './RoleCreateOrConnectWithoutClientInput.schema';
import { RoleCreateManyClientInputEnvelopeObjectSchema as RoleCreateManyClientInputEnvelopeObjectSchema } from './RoleCreateManyClientInputEnvelope.schema';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './RoleWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => RoleCreateWithoutClientInputObjectSchema), z.lazy(() => RoleCreateWithoutClientInputObjectSchema).array(), z.lazy(() => RoleUncheckedCreateWithoutClientInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutClientInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => RoleCreateOrConnectWithoutClientInputObjectSchema), z.lazy(() => RoleCreateOrConnectWithoutClientInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => RoleCreateManyClientInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => RoleWhereUniqueInputObjectSchema), z.lazy(() => RoleWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const RoleCreateNestedManyWithoutClientInputObjectSchema: z.ZodType<Prisma.RoleCreateNestedManyWithoutClientInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleCreateNestedManyWithoutClientInput>;
export const RoleCreateNestedManyWithoutClientInputObjectZodSchema = makeSchema();
