import type { z } from "@hono/zod-openapi";
import type { UserCreateDtoSchema, UserDetailDtoSchema, UserDtoSchema, UserPaginationQueryDtoSchema, UserQueryDtoSchema, UserQueryWithPrivilegeDelegationDtoSchema } from "./user.schema";

export type UserDto = z.infer<typeof UserDtoSchema>;
export type UserDetailDto = z.infer<typeof UserDetailDtoSchema>;
export type UserQueryDto = z.infer<typeof UserQueryDtoSchema>;
export type UserPaginationQueryDto = z.infer<typeof UserPaginationQueryDtoSchema>;
export type UserQueryWithPrivilegeDelegationDto = z.infer<typeof UserQueryWithPrivilegeDelegationDtoSchema>;
export type UserCreateDto = z.infer<typeof UserCreateDtoSchema>;
