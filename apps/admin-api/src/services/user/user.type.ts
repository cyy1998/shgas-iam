import type { z } from "@hono/zod-openapi";
import type {
  UserAdminCreateDtoSchema,
  UserCreateDtoSchema,
  UserDetailDtoSchema,
  UserPaginationQueryDtoSchema,
  UserUpdateDtoSchema,
} from "./user.schema";

export interface UserDetailDto extends z.infer<typeof UserDetailDtoSchema> {}
export interface UserPaginationQueryDto extends z.infer<typeof UserPaginationQueryDtoSchema> {}
export interface UserCreateDto extends z.infer<typeof UserCreateDtoSchema> {}
export interface UserAdminCreateDto extends z.infer<typeof UserAdminCreateDtoSchema> {}
export interface UserUpdateDto extends z.infer<typeof UserUpdateDtoSchema> {}
