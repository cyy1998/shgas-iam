import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailCreateWithoutPrivilegeInputObjectSchema as DelegationDetailCreateWithoutPrivilegeInputObjectSchema } from './DelegationDetailCreateWithoutPrivilegeInput.schema';
import { DelegationDetailUncheckedCreateWithoutPrivilegeInputObjectSchema as DelegationDetailUncheckedCreateWithoutPrivilegeInputObjectSchema } from './DelegationDetailUncheckedCreateWithoutPrivilegeInput.schema';
import { DelegationDetailCreateOrConnectWithoutPrivilegeInputObjectSchema as DelegationDetailCreateOrConnectWithoutPrivilegeInputObjectSchema } from './DelegationDetailCreateOrConnectWithoutPrivilegeInput.schema';
import { DelegationDetailCreateManyPrivilegeInputEnvelopeObjectSchema as DelegationDetailCreateManyPrivilegeInputEnvelopeObjectSchema } from './DelegationDetailCreateManyPrivilegeInputEnvelope.schema';
import { DelegationDetailWhereUniqueInputObjectSchema as DelegationDetailWhereUniqueInputObjectSchema } from './DelegationDetailWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => DelegationDetailCreateWithoutPrivilegeInputObjectSchema), z.lazy(() => DelegationDetailCreateWithoutPrivilegeInputObjectSchema).array(), z.lazy(() => DelegationDetailUncheckedCreateWithoutPrivilegeInputObjectSchema), z.lazy(() => DelegationDetailUncheckedCreateWithoutPrivilegeInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => DelegationDetailCreateOrConnectWithoutPrivilegeInputObjectSchema), z.lazy(() => DelegationDetailCreateOrConnectWithoutPrivilegeInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => DelegationDetailCreateManyPrivilegeInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema), z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const DelegationDetailUncheckedCreateNestedManyWithoutPrivilegeInputObjectSchema: z.ZodType<Prisma.DelegationDetailUncheckedCreateNestedManyWithoutPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUncheckedCreateNestedManyWithoutPrivilegeInput>;
export const DelegationDetailUncheckedCreateNestedManyWithoutPrivilegeInputObjectZodSchema = makeSchema();
