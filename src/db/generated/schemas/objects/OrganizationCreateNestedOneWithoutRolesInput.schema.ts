import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateWithoutRolesInputObjectSchema as OrganizationCreateWithoutRolesInputObjectSchema } from './OrganizationCreateWithoutRolesInput.schema';
import { OrganizationUncheckedCreateWithoutRolesInputObjectSchema as OrganizationUncheckedCreateWithoutRolesInputObjectSchema } from './OrganizationUncheckedCreateWithoutRolesInput.schema';
import { OrganizationCreateOrConnectWithoutRolesInputObjectSchema as OrganizationCreateOrConnectWithoutRolesInputObjectSchema } from './OrganizationCreateOrConnectWithoutRolesInput.schema';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationCreateWithoutRolesInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutRolesInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => OrganizationCreateOrConnectWithoutRolesInputObjectSchema).optional(),
  connect: z.lazy(() => OrganizationWhereUniqueInputObjectSchema).optional()
}).strict();
export const OrganizationCreateNestedOneWithoutRolesInputObjectSchema: z.ZodType<Prisma.OrganizationCreateNestedOneWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateNestedOneWithoutRolesInput>;
export const OrganizationCreateNestedOneWithoutRolesInputObjectZodSchema = makeSchema();
