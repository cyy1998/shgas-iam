import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateWithoutParentInputObjectSchema as OrganizationCreateWithoutParentInputObjectSchema } from './OrganizationCreateWithoutParentInput.schema';
import { OrganizationUncheckedCreateWithoutParentInputObjectSchema as OrganizationUncheckedCreateWithoutParentInputObjectSchema } from './OrganizationUncheckedCreateWithoutParentInput.schema';
import { OrganizationCreateOrConnectWithoutParentInputObjectSchema as OrganizationCreateOrConnectWithoutParentInputObjectSchema } from './OrganizationCreateOrConnectWithoutParentInput.schema';
import { OrganizationUpsertWithWhereUniqueWithoutParentInputObjectSchema as OrganizationUpsertWithWhereUniqueWithoutParentInputObjectSchema } from './OrganizationUpsertWithWhereUniqueWithoutParentInput.schema';
import { OrganizationCreateManyParentInputEnvelopeObjectSchema as OrganizationCreateManyParentInputEnvelopeObjectSchema } from './OrganizationCreateManyParentInputEnvelope.schema';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema';
import { OrganizationUpdateWithWhereUniqueWithoutParentInputObjectSchema as OrganizationUpdateWithWhereUniqueWithoutParentInputObjectSchema } from './OrganizationUpdateWithWhereUniqueWithoutParentInput.schema';
import { OrganizationUpdateManyWithWhereWithoutParentInputObjectSchema as OrganizationUpdateManyWithWhereWithoutParentInputObjectSchema } from './OrganizationUpdateManyWithWhereWithoutParentInput.schema';
import { OrganizationScalarWhereInputObjectSchema as OrganizationScalarWhereInputObjectSchema } from './OrganizationScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationCreateWithoutParentInputObjectSchema), z.lazy(() => OrganizationCreateWithoutParentInputObjectSchema).array(), z.lazy(() => OrganizationUncheckedCreateWithoutParentInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutParentInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => OrganizationCreateOrConnectWithoutParentInputObjectSchema), z.lazy(() => OrganizationCreateOrConnectWithoutParentInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => OrganizationUpsertWithWhereUniqueWithoutParentInputObjectSchema), z.lazy(() => OrganizationUpsertWithWhereUniqueWithoutParentInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => OrganizationCreateManyParentInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => OrganizationWhereUniqueInputObjectSchema), z.lazy(() => OrganizationWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => OrganizationWhereUniqueInputObjectSchema), z.lazy(() => OrganizationWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => OrganizationWhereUniqueInputObjectSchema), z.lazy(() => OrganizationWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => OrganizationWhereUniqueInputObjectSchema), z.lazy(() => OrganizationWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => OrganizationUpdateWithWhereUniqueWithoutParentInputObjectSchema), z.lazy(() => OrganizationUpdateWithWhereUniqueWithoutParentInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => OrganizationUpdateManyWithWhereWithoutParentInputObjectSchema), z.lazy(() => OrganizationUpdateManyWithWhereWithoutParentInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => OrganizationScalarWhereInputObjectSchema), z.lazy(() => OrganizationScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const OrganizationUncheckedUpdateManyWithoutParentNestedInputObjectSchema: z.ZodType<Prisma.OrganizationUncheckedUpdateManyWithoutParentNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUncheckedUpdateManyWithoutParentNestedInput>;
export const OrganizationUncheckedUpdateManyWithoutParentNestedInputObjectZodSchema = makeSchema();
