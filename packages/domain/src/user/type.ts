import type { z } from "@hono/zod-openapi";
import type { OidcAccountDtoSchema, UserCreateDtoSchema, UserDetailDtoSchema, UserDtoSchema, UserSchema } from "./schema";

export type User = z.infer<typeof UserSchema>;
export type UserDto = z.infer<typeof UserDtoSchema>;
export type UserDetailDto = z.infer<typeof UserDetailDtoSchema>;
export type UserCreateDto = z.infer<typeof UserCreateDtoSchema>;
export type OidcAccountDto = z.infer<typeof OidcAccountDtoSchema>;
