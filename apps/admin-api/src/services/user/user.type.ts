import type { z } from "@hono/zod-openapi";
import type {
  UserAdminCreateDtoSchema,
  UserPaginationQueryDtoSchema,
  UserUpdateDtoSchema,
} from "./user.schema";

export type { User, UserCreateDto, UserDetailDto } from "@iam/domain/user";
export interface UserPaginationQueryDto extends z.infer<typeof UserPaginationQueryDtoSchema> {}
export interface UserAdminCreateDto extends z.infer<typeof UserAdminCreateDtoSchema> {}
export interface UserUpdateDto extends z.infer<typeof UserUpdateDtoSchema> {}
