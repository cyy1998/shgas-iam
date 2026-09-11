import type { z } from "@hono/zod-openapi";
import type {
  UserAdminCreateDtoSchema,
  UserDetailDtoSchema,
  UserPaginationQueryDtoSchema,
  UserUpdateDtoSchema,
} from "./user.schema";

export type { User, UserCreateDto } from "@iam/domain/user";
export type UserDetailDto = z.infer<typeof UserDetailDtoSchema>;
export interface UserPaginationQueryDto extends z.infer<typeof UserPaginationQueryDtoSchema> {}
export interface UserAdminCreateDto extends z.infer<typeof UserAdminCreateDtoSchema> {}
export interface UserUpdateDto extends z.infer<typeof UserUpdateDtoSchema> {}
