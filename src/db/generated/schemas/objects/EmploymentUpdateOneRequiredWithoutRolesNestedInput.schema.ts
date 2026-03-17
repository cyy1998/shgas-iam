import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateWithoutRolesInputObjectSchema as EmploymentCreateWithoutRolesInputObjectSchema } from './EmploymentCreateWithoutRolesInput.schema';
import { EmploymentUncheckedCreateWithoutRolesInputObjectSchema as EmploymentUncheckedCreateWithoutRolesInputObjectSchema } from './EmploymentUncheckedCreateWithoutRolesInput.schema';
import { EmploymentCreateOrConnectWithoutRolesInputObjectSchema as EmploymentCreateOrConnectWithoutRolesInputObjectSchema } from './EmploymentCreateOrConnectWithoutRolesInput.schema';
import { EmploymentUpsertWithoutRolesInputObjectSchema as EmploymentUpsertWithoutRolesInputObjectSchema } from './EmploymentUpsertWithoutRolesInput.schema';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './EmploymentWhereUniqueInput.schema';
import { EmploymentUpdateToOneWithWhereWithoutRolesInputObjectSchema as EmploymentUpdateToOneWithWhereWithoutRolesInputObjectSchema } from './EmploymentUpdateToOneWithWhereWithoutRolesInput.schema';
import { EmploymentUpdateWithoutRolesInputObjectSchema as EmploymentUpdateWithoutRolesInputObjectSchema } from './EmploymentUpdateWithoutRolesInput.schema';
import { EmploymentUncheckedUpdateWithoutRolesInputObjectSchema as EmploymentUncheckedUpdateWithoutRolesInputObjectSchema } from './EmploymentUncheckedUpdateWithoutRolesInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => EmploymentCreateWithoutRolesInputObjectSchema), z.lazy(() => EmploymentUncheckedCreateWithoutRolesInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => EmploymentCreateOrConnectWithoutRolesInputObjectSchema).optional(),
  upsert: z.lazy(() => EmploymentUpsertWithoutRolesInputObjectSchema).optional(),
  connect: z.lazy(() => EmploymentWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => EmploymentUpdateToOneWithWhereWithoutRolesInputObjectSchema), z.lazy(() => EmploymentUpdateWithoutRolesInputObjectSchema), z.lazy(() => EmploymentUncheckedUpdateWithoutRolesInputObjectSchema)]).optional()
}).strict();
export const EmploymentUpdateOneRequiredWithoutRolesNestedInputObjectSchema: z.ZodType<Prisma.EmploymentUpdateOneRequiredWithoutRolesNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpdateOneRequiredWithoutRolesNestedInput>;
export const EmploymentUpdateOneRequiredWithoutRolesNestedInputObjectZodSchema = makeSchema();
