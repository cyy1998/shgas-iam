import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationRoleCreateWithoutRoleInputObjectSchema as OrganizationRoleCreateWithoutRoleInputObjectSchema } from './OrganizationRoleCreateWithoutRoleInput.schema';
import { OrganizationRoleUncheckedCreateWithoutRoleInputObjectSchema as OrganizationRoleUncheckedCreateWithoutRoleInputObjectSchema } from './OrganizationRoleUncheckedCreateWithoutRoleInput.schema';
import { OrganizationRoleCreateOrConnectWithoutRoleInputObjectSchema as OrganizationRoleCreateOrConnectWithoutRoleInputObjectSchema } from './OrganizationRoleCreateOrConnectWithoutRoleInput.schema';
import { OrganizationRoleUpsertWithWhereUniqueWithoutRoleInputObjectSchema as OrganizationRoleUpsertWithWhereUniqueWithoutRoleInputObjectSchema } from './OrganizationRoleUpsertWithWhereUniqueWithoutRoleInput.schema';
import { OrganizationRoleCreateManyRoleInputEnvelopeObjectSchema as OrganizationRoleCreateManyRoleInputEnvelopeObjectSchema } from './OrganizationRoleCreateManyRoleInputEnvelope.schema';
import { OrganizationRoleWhereUniqueInputObjectSchema as OrganizationRoleWhereUniqueInputObjectSchema } from './OrganizationRoleWhereUniqueInput.schema';
import { OrganizationRoleUpdateWithWhereUniqueWithoutRoleInputObjectSchema as OrganizationRoleUpdateWithWhereUniqueWithoutRoleInputObjectSchema } from './OrganizationRoleUpdateWithWhereUniqueWithoutRoleInput.schema';
import { OrganizationRoleUpdateManyWithWhereWithoutRoleInputObjectSchema as OrganizationRoleUpdateManyWithWhereWithoutRoleInputObjectSchema } from './OrganizationRoleUpdateManyWithWhereWithoutRoleInput.schema';
import { OrganizationRoleScalarWhereInputObjectSchema as OrganizationRoleScalarWhereInputObjectSchema } from './OrganizationRoleScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationRoleCreateWithoutRoleInputObjectSchema), z.lazy(() => OrganizationRoleCreateWithoutRoleInputObjectSchema).array(), z.lazy(() => OrganizationRoleUncheckedCreateWithoutRoleInputObjectSchema), z.lazy(() => OrganizationRoleUncheckedCreateWithoutRoleInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => OrganizationRoleCreateOrConnectWithoutRoleInputObjectSchema), z.lazy(() => OrganizationRoleCreateOrConnectWithoutRoleInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => OrganizationRoleUpsertWithWhereUniqueWithoutRoleInputObjectSchema), z.lazy(() => OrganizationRoleUpsertWithWhereUniqueWithoutRoleInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => OrganizationRoleCreateManyRoleInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema), z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema), z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema), z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema), z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => OrganizationRoleUpdateWithWhereUniqueWithoutRoleInputObjectSchema), z.lazy(() => OrganizationRoleUpdateWithWhereUniqueWithoutRoleInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => OrganizationRoleUpdateManyWithWhereWithoutRoleInputObjectSchema), z.lazy(() => OrganizationRoleUpdateManyWithWhereWithoutRoleInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => OrganizationRoleScalarWhereInputObjectSchema), z.lazy(() => OrganizationRoleScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const OrganizationRoleUncheckedUpdateManyWithoutRoleNestedInputObjectSchema: z.ZodType<Prisma.OrganizationRoleUncheckedUpdateManyWithoutRoleNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleUncheckedUpdateManyWithoutRoleNestedInput>;
export const OrganizationRoleUncheckedUpdateManyWithoutRoleNestedInputObjectZodSchema = makeSchema();
