import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationCreateWithoutOrganizationScopeInputObjectSchema as PrivilegeDelegationCreateWithoutOrganizationScopeInputObjectSchema } from './PrivilegeDelegationCreateWithoutOrganizationScopeInput.schema';
import { PrivilegeDelegationUncheckedCreateWithoutOrganizationScopeInputObjectSchema as PrivilegeDelegationUncheckedCreateWithoutOrganizationScopeInputObjectSchema } from './PrivilegeDelegationUncheckedCreateWithoutOrganizationScopeInput.schema';
import { PrivilegeDelegationCreateOrConnectWithoutOrganizationScopeInputObjectSchema as PrivilegeDelegationCreateOrConnectWithoutOrganizationScopeInputObjectSchema } from './PrivilegeDelegationCreateOrConnectWithoutOrganizationScopeInput.schema';
import { PrivilegeDelegationUpsertWithWhereUniqueWithoutOrganizationScopeInputObjectSchema as PrivilegeDelegationUpsertWithWhereUniqueWithoutOrganizationScopeInputObjectSchema } from './PrivilegeDelegationUpsertWithWhereUniqueWithoutOrganizationScopeInput.schema';
import { PrivilegeDelegationCreateManyOrganizationScopeInputEnvelopeObjectSchema as PrivilegeDelegationCreateManyOrganizationScopeInputEnvelopeObjectSchema } from './PrivilegeDelegationCreateManyOrganizationScopeInputEnvelope.schema';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './PrivilegeDelegationWhereUniqueInput.schema';
import { PrivilegeDelegationUpdateWithWhereUniqueWithoutOrganizationScopeInputObjectSchema as PrivilegeDelegationUpdateWithWhereUniqueWithoutOrganizationScopeInputObjectSchema } from './PrivilegeDelegationUpdateWithWhereUniqueWithoutOrganizationScopeInput.schema';
import { PrivilegeDelegationUpdateManyWithWhereWithoutOrganizationScopeInputObjectSchema as PrivilegeDelegationUpdateManyWithWhereWithoutOrganizationScopeInputObjectSchema } from './PrivilegeDelegationUpdateManyWithWhereWithoutOrganizationScopeInput.schema';
import { PrivilegeDelegationScalarWhereInputObjectSchema as PrivilegeDelegationScalarWhereInputObjectSchema } from './PrivilegeDelegationScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PrivilegeDelegationCreateWithoutOrganizationScopeInputObjectSchema), z.lazy(() => PrivilegeDelegationCreateWithoutOrganizationScopeInputObjectSchema).array(), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutOrganizationScopeInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedCreateWithoutOrganizationScopeInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => PrivilegeDelegationCreateOrConnectWithoutOrganizationScopeInputObjectSchema), z.lazy(() => PrivilegeDelegationCreateOrConnectWithoutOrganizationScopeInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => PrivilegeDelegationUpsertWithWhereUniqueWithoutOrganizationScopeInputObjectSchema), z.lazy(() => PrivilegeDelegationUpsertWithWhereUniqueWithoutOrganizationScopeInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => PrivilegeDelegationCreateManyOrganizationScopeInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema), z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema), z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema), z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema), z.lazy(() => PrivilegeDelegationWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => PrivilegeDelegationUpdateWithWhereUniqueWithoutOrganizationScopeInputObjectSchema), z.lazy(() => PrivilegeDelegationUpdateWithWhereUniqueWithoutOrganizationScopeInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => PrivilegeDelegationUpdateManyWithWhereWithoutOrganizationScopeInputObjectSchema), z.lazy(() => PrivilegeDelegationUpdateManyWithWhereWithoutOrganizationScopeInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => PrivilegeDelegationScalarWhereInputObjectSchema), z.lazy(() => PrivilegeDelegationScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const PrivilegeDelegationUpdateManyWithoutOrganizationScopeNestedInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUpdateManyWithoutOrganizationScopeNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUpdateManyWithoutOrganizationScopeNestedInput>;
export const PrivilegeDelegationUpdateManyWithoutOrganizationScopeNestedInputObjectZodSchema = makeSchema();
