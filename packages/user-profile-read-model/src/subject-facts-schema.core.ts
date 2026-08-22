import { z } from "@hono/zod-openapi";

const SubjectOrganizationSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
}).strict();

export const SubjectFactsEmploymentSchema = z.object({
  isPrimary: z.boolean(),
  organization: SubjectOrganizationSchema.extend({
    path: z.array(SubjectOrganizationSchema).min(1),
  }).strict(),
  position: z.object({
    code: z.string().min(1),
    name: z.string().min(1),
  }).strict(),
  clientAuthorizations: z.array(z.object({
    clientCode: z.string().min(1),
    roles: z.array(z.object({
      code: z.string().min(1),
      privileges: z.array(z.string().min(1)),
    }).strict()).min(1),
  }).strict()),
}).strict();
