import type { z } from "@hono/zod-openapi";
import type {
  UserCreateDtoSchema,
  UserDetailDtoSchema,
  UserPaginationQueryDtoSchema,
} from "./user.schema";

export interface UserDetailDto extends z.infer<typeof UserDetailDtoSchema> {}
export interface UserPaginationQueryDto extends z.infer<typeof UserPaginationQueryDtoSchema> {}
export interface UserCreateDto extends z.infer<typeof UserCreateDtoSchema> {}
