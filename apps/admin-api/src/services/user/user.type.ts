import type { z } from "@hono/zod-openapi";
import type { CustomAttributeValues } from "@iam/contracts/custom-attributes";
import type { User as SharedUser } from "@iam/domain/user";
import type {
  UserAdminCreateDtoSchema,
  UserDetailDtoSchema,
  UserPaginationQueryDtoSchema,
  UserUpdateDtoSchema,
  UserWecomExternalBindingSchema,
} from "./user.schema";

export type { UserCreateDto } from "@iam/domain/user";
export type User = SharedUser & { customAttributes?: CustomAttributeValues };
export type UserDetailDto = z.infer<typeof UserDetailDtoSchema>;
export type UserWecomExternalBinding = z.infer<typeof UserWecomExternalBindingSchema>;
export interface UserPaginationQueryDto extends z.infer<typeof UserPaginationQueryDtoSchema> {}
export interface UserAdminCreateDto extends z.infer<typeof UserAdminCreateDtoSchema> {}
export interface UserUpdateDto extends z.infer<typeof UserUpdateDtoSchema> {}
