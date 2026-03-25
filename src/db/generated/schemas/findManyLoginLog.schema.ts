import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { LoginLogOrderByWithRelationInputObjectSchema as LoginLogOrderByWithRelationInputObjectSchema } from './objects/LoginLogOrderByWithRelationInput.schema';
import { LoginLogWhereInputObjectSchema as LoginLogWhereInputObjectSchema } from './objects/LoginLogWhereInput.schema';
import { LoginLogWhereUniqueInputObjectSchema as LoginLogWhereUniqueInputObjectSchema } from './objects/LoginLogWhereUniqueInput.schema';
import { LoginLogScalarFieldEnumSchema } from './enums/LoginLogScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const LoginLogFindManySelectSchema: z.ZodType<Prisma.LoginLogSelect> = z.object({
    id: z.boolean().optional(),
    userId: z.boolean().optional(),
    username: z.boolean().optional(),
    name: z.boolean().optional(),
    clientCode: z.boolean().optional(),
    loginType: z.boolean().optional(),
    loginTime: z.boolean().optional()
  }).strict() as unknown as z.ZodType<Prisma.LoginLogSelect>;

export const LoginLogFindManySelectZodSchema = z.object({
    id: z.boolean().optional(),
    userId: z.boolean().optional(),
    username: z.boolean().optional(),
    name: z.boolean().optional(),
    clientCode: z.boolean().optional(),
    loginType: z.boolean().optional(),
    loginTime: z.boolean().optional()
  }).strict();

export const LoginLogFindManySchema: z.ZodType<Prisma.LoginLogFindManyArgs> = z.object({ select: LoginLogFindManySelectSchema.optional(),  orderBy: z.union([LoginLogOrderByWithRelationInputObjectSchema, LoginLogOrderByWithRelationInputObjectSchema.array()]).optional(), where: LoginLogWhereInputObjectSchema.optional(), cursor: LoginLogWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([LoginLogScalarFieldEnumSchema, LoginLogScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.LoginLogFindManyArgs>;

export const LoginLogFindManyZodSchema = z.object({ select: LoginLogFindManySelectSchema.optional(),  orderBy: z.union([LoginLogOrderByWithRelationInputObjectSchema, LoginLogOrderByWithRelationInputObjectSchema.array()]).optional(), where: LoginLogWhereInputObjectSchema.optional(), cursor: LoginLogWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([LoginLogScalarFieldEnumSchema, LoginLogScalarFieldEnumSchema.array()]).optional() }).strict();