import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationRoleCreateWithoutOrganizationInputObjectSchema as OrganizationRoleCreateWithoutOrganizationInputObjectSchema } from './OrganizationRoleCreateWithoutOrganizationInput.schema';
import { OrganizationRoleUncheckedCreateWithoutOrganizationInputObjectSchema as OrganizationRoleUncheckedCreateWithoutOrganizationInputObjectSchema } from './OrganizationRoleUncheckedCreateWithoutOrganizationInput.schema';
import { OrganizationRoleCreateOrConnectWithoutOrganizationInputObjectSchema as OrganizationRoleCreateOrConnectWithoutOrganizationInputObjectSchema } from './OrganizationRoleCreateOrConnectWithoutOrganizationInput.schema';
import { OrganizationRoleUpsertWithWhereUniqueWithoutOrganizationInputObjectSchema as OrganizationRoleUpsertWithWhereUniqueWithoutOrganizationInputObjectSchema } from './OrganizationRoleUpsertWithWhereUniqueWithoutOrganizationInput.schema';
import { OrganizationRoleCreateManyOrganizationInputEnvelopeObjectSchema as OrganizationRoleCreateManyOrganizationInputEnvelopeObjectSchema } from './OrganizationRoleCreateManyOrganizationInputEnvelope.schema';
import { OrganizationRoleWhereUniqueInputObjectSchema as OrganizationRoleWhereUniqueInputObjectSchema } from './OrganizationRoleWhereUniqueInput.schema';
import { OrganizationRoleUpdateWithWhereUniqueWithoutOrganizationInputObjectSchema as OrganizationRoleUpdateWithWhereUniqueWithoutOrganizationInputObjectSchema } from './OrganizationRoleUpdateWithWhereUniqueWithoutOrganizationInput.schema';
import { OrganizationRoleUpdateManyWithWhereWithoutOrganizationInputObjectSchema as OrganizationRoleUpdateManyWithWhereWithoutOrganizationInputObjectSchema } from './OrganizationRoleUpdateManyWithWhereWithoutOrganizationInput.schema';
import { OrganizationRoleScalarWhereInputObjectSchema as OrganizationRoleScalarWhereInputObjectSchema } from './OrganizationRoleScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationRoleCreateWithoutOrganizationInputObjectSchema), z.lazy(() => OrganizationRoleCreateWithoutOrganizationInputObjectSchema).array(), z.lazy(() => OrganizationRoleUncheckedCreateWithoutOrganizationInputObjectSchema), z.lazy(() => OrganizationRoleUncheckedCreateWithoutOrganizationInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => OrganizationRoleCreateOrConnectWithoutOrganizationInputObjectSchema), z.lazy(() => OrganizationRoleCreateOrConnectWithoutOrganizationInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => OrganizationRoleUpsertWithWhereUniqueWithoutOrganizationInputObjectSchema), z.lazy(() => OrganizationRoleUpsertWithWhereUniqueWithoutOrganizationInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => OrganizationRoleCreateManyOrganizationInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema), z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema), z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema), z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema), z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => OrganizationRoleUpdateWithWhereUniqueWithoutOrganizationInputObjectSchema), z.lazy(() => OrganizationRoleUpdateWithWhereUniqueWithoutOrganizationInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => OrganizationRoleUpdateManyWithWhereWithoutOrganizationInputObjectSchema), z.lazy(() => OrganizationRoleUpdateManyWithWhereWithoutOrganizationInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => OrganizationRoleScalarWhereInputObjectSchema), z.lazy(() => OrganizationRoleScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const OrganizationRoleUpdateManyWithoutOrganizationNestedInputObjectSchema: z.ZodType<Prisma.OrganizationRoleUpdateManyWithoutOrganizationNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleUpdateManyWithoutOrganizationNestedInput>;
export const OrganizationRoleUpdateManyWithoutOrganizationNestedInputObjectZodSchema = makeSchema();
