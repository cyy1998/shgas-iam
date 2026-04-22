import type { z } from "@hono/zod-openapi";
import type {
  UserAdminCreateDtoSchema,
  UserCreateDtoSchema,
  UserDetailDtoSchema,
  UserDtoSchema,
  UserPaginationQueryDtoSchema,
  UserQueryDtoSchema,
  UserQueryWithPrivilegeDelegationDtoSchema,
  UserStatusUpdateDtoSchema,
  UserUpdateDtoSchema,
} from "./user.schema";

export interface UserDto extends z.infer<typeof UserDtoSchema> {}
export interface UserDetailDto extends z.infer<typeof UserDetailDtoSchema> {}
export interface UserQueryDto extends z.infer<typeof UserQueryDtoSchema> {}
export interface UserPaginationQueryDto extends z.infer<typeof UserPaginationQueryDtoSchema> {}
export interface UserQueryWithPrivilegeDelegationDto
  extends z.infer<typeof UserQueryWithPrivilegeDelegationDtoSchema> {}
export interface UserCreateDto extends z.infer<typeof UserCreateDtoSchema> {}
export interface UserAdminCreateDto extends z.infer<typeof UserAdminCreateDtoSchema> {}
export interface UserUpdateDto extends z.infer<typeof UserUpdateDtoSchema> {}
export interface UserStatusUpdateDto extends z.infer<typeof UserStatusUpdateDtoSchema> {}
