import type { z } from "@hono/zod-openapi";
import type {
  UserQueryDtoSchema,
  UserQueryWithPrivilegeDelegationDtoSchema,
} from "./user.schema";

export type { UserCreateDto, UserDetailDto, UserDto } from "@iam/domain/user";
export interface UserQueryDto extends z.infer<typeof UserQueryDtoSchema> {}
export interface UserQueryWithPrivilegeDelegationDto
  extends z.infer<typeof UserQueryWithPrivilegeDelegationDtoSchema> {}
