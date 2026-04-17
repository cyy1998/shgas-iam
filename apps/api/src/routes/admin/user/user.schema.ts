import { z } from "@hono/zod-openapi";
import { statusToString } from "@/enums/status";
import { EmploymentDetailDtoSchema } from "@/services/employment/employment.schema";
import { UserDetailDtoSchema, UserDtoSchema } from "@/services/user/user.schema";

export const UserVoSchema = UserDtoSchema.extend({
  statusText: z.string().openapi({ example: "正常" }),
}).openapi("UserVo");

export const UserVoConverterSchema = UserDtoSchema.transform((e) => {
  return {
    ...e,
    statusText: statusToString[e.status],
  };
}).pipe(UserVoSchema);

export const UserDetailVoSchema = UserVoSchema.extend({
  employments: z.array(EmploymentDetailDtoSchema.required()),
  privileges: z.array(z.string()).openapi({ example: ["ui:button:tender:create-GYBG"] }),
  roles: z.array(z.string()).openapi({ example: ["tender:default-user"] }),
}).openapi("UserDetailVo");

export const UserDetailVoConverterSchema = UserDetailDtoSchema.transform((e) => {
  return {
    ...e,
    statusText: statusToString[e.status],
  };
}).pipe(UserDetailVoSchema);

// export const UserAdminDtoSchema = z.object({
//   id: z.number().openapi({ example: 1 }),
//   username: z.string().openapi({ example: "138550" }),
//   name: z.string().openapi({ example: "蔡奕阳" }),
//   mobile: z.string().nullable().openapi({ example: "17721462865" }),
//   wxId: z.string().nullable().openapi({ example: "1592677631" }),
//   userType: z.string().nullable().openapi({ example: "正式员工" }),
//   orcasId: z.string().nullable().openapi({ example: "ada8wf89w83b2" }),
//   status: z.enum(UserStatus).openapi({ example: 1 }),
//   orderNum: z.number().openapi({ example: 1 }),
//   createTime: z.iso.datetime(),
//   updateTime: z.iso.datetime(),
// }).openapi("UserAdminDto");

// export type UserAdminDto = z.infer<typeof UserAdminDtoSchema>;

// export const UserAdminDetailDtoSchema = UserAdminDtoSchema.extend({
//   employments: z.array(EmploymentAdminDtoSchema).optional(),
// });

// export const UserAdminVoSchema = UserAdminDtoSchema.extend({
//   statusText: z.string().openapi({ example: "正常" }),
// }).openapi("UserAdminVo");

// export type UserAdminVo = z.infer<typeof UserAdminVoSchema>;

// export const UserAdminDetailVoSchema = UserAdminVoSchema.extend({
//   employments: z.array(EmploymentAdminVoSchema).optional(),
// });
