import type { EmploymentRouteHandler } from "./employment.type";
import * as employmentService from "@/services/employment/employment.service";
import * as resp from "@/utils/http/response";
import { EmploymentVoConverterSchema } from "./employment.schema";

export const employmentsSearch: EmploymentRouteHandler<"employmentsSearch"> = async (c) => {
  const employmentQueryDto = c.req.valid("json");
  const { result, ...data } = await employmentService.searchEmploymentsFuzzy(employmentQueryDto);
  const employmentVos = result.map(e => EmploymentVoConverterSchema.parse(e));
  return c.json(resp.ok({ result: employmentVos, ...data }));
};

export const employmentsSet: EmploymentRouteHandler<"employmentsSet"> = async (c) => {
  const { username, posCode, orgCode } = c.req.valid("json");
  const data = await employmentService.setEmployment(username, posCode, orgCode);
  return c.json(resp.ok(data));
};
