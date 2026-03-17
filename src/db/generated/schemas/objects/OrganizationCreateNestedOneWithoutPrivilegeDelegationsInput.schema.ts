import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateWithoutPrivilegeDelegationsInputObjectSchema as OrganizationCreateWithoutPrivilegeDelegationsInputObjectSchema } from './OrganizationCreateWithoutPrivilegeDelegationsInput.schema';
import { OrganizationUncheckedCreateWithoutPrivilegeDelegationsInputObjectSchema as OrganizationUncheckedCreateWithoutPrivilegeDelegationsInputObjectSchema } from './OrganizationUncheckedCreateWithoutPrivilegeDelegationsInput.schema';
import { OrganizationCreateOrConnectWithoutPrivilegeDelegationsInputObjectSchema as OrganizationCreateOrConnectWithoutPrivilegeDelegationsInputObjectSchema } from './OrganizationCreateOrConnectWithoutPrivilegeDelegationsInput.schema';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationCreateWithoutPrivilegeDelegationsInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutPrivilegeDelegationsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => OrganizationCreateOrConnectWithoutPrivilegeDelegationsInputObjectSchema).optional(),
  connect: z.lazy(() => OrganizationWhereUniqueInputObjectSchema).optional()
}).strict();
export const OrganizationCreateNestedOneWithoutPrivilegeDelegationsInputObjectSchema: z.ZodType<Prisma.OrganizationCreateNestedOneWithoutPrivilegeDelegationsInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateNestedOneWithoutPrivilegeDelegationsInput>;
export const OrganizationCreateNestedOneWithoutPrivilegeDelegationsInputObjectZodSchema = makeSchema();
