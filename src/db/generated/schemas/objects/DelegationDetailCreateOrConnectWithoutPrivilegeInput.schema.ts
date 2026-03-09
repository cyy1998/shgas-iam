import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailWhereUniqueInputObjectSchema as DelegationDetailWhereUniqueInputObjectSchema } from './DelegationDetailWhereUniqueInput.schema';
import { DelegationDetailCreateWithoutPrivilegeInputObjectSchema as DelegationDetailCreateWithoutPrivilegeInputObjectSchema } from './DelegationDetailCreateWithoutPrivilegeInput.schema';
import { DelegationDetailUncheckedCreateWithoutPrivilegeInputObjectSchema as DelegationDetailUncheckedCreateWithoutPrivilegeInputObjectSchema } from './DelegationDetailUncheckedCreateWithoutPrivilegeInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => DelegationDetailCreateWithoutPrivilegeInputObjectSchema), z.lazy(() => DelegationDetailUncheckedCreateWithoutPrivilegeInputObjectSchema)])
}).strict();
export const DelegationDetailCreateOrConnectWithoutPrivilegeInputObjectSchema: z.ZodType<Prisma.DelegationDetailCreateOrConnectWithoutPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailCreateOrConnectWithoutPrivilegeInput>;
export const DelegationDetailCreateOrConnectWithoutPrivilegeInputObjectZodSchema = makeSchema();
