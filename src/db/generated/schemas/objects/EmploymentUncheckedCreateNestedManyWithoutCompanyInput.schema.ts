import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateWithoutCompanyInputObjectSchema as EmploymentCreateWithoutCompanyInputObjectSchema } from './EmploymentCreateWithoutCompanyInput.schema';
import { EmploymentUncheckedCreateWithoutCompanyInputObjectSchema as EmploymentUncheckedCreateWithoutCompanyInputObjectSchema } from './EmploymentUncheckedCreateWithoutCompanyInput.schema';
import { EmploymentCreateOrConnectWithoutCompanyInputObjectSchema as EmploymentCreateOrConnectWithoutCompanyInputObjectSchema } from './EmploymentCreateOrConnectWithoutCompanyInput.schema';
import { EmploymentCreateManyCompanyInputEnvelopeObjectSchema as EmploymentCreateManyCompanyInputEnvelopeObjectSchema } from './EmploymentCreateManyCompanyInputEnvelope.schema';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => EmploymentCreateWithoutCompanyInputObjectSchema), z.lazy(() => EmploymentCreateWithoutCompanyInputObjectSchema).array(), z.lazy(() => EmploymentUncheckedCreateWithoutCompanyInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutCompanyInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => EmploymentCreateOrConnectWithoutCompanyInputObjectSchema), z.lazy(() => EmploymentCreateOrConnectWithoutCompanyInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => EmploymentCreateManyCompanyInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => EmploymentWhereUniqueInputObjectSchema), z.lazy(() => EmploymentWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const EmploymentUncheckedCreateNestedManyWithoutCompanyInputObjectSchema: z.ZodType<Prisma.EmploymentUncheckedCreateNestedManyWithoutCompanyInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUncheckedCreateNestedManyWithoutCompanyInput>;
export const EmploymentUncheckedCreateNestedManyWithoutCompanyInputObjectZodSchema = makeSchema();
