import type { User } from "@iam/db/schema";
import type { UserDetailDto } from "./user.type";
import * as employmentRepository from "@api/services/employment/employment.repository";
import { EmploymentDetailDtoSchema, toEmploymentDto } from "@api/services/employment/employment.schema";
import * as privilegeRepository from "@api/services/privilege/privilege.repository";
import * as roleRepository from "@api/services/role/role.repository";
import { UserNotFoundError } from "@iam/domain/user";
import { UserDetailDtoSchema } from "./user.schema";

export async function buildUserDetail(user: User | null): Promise<UserDetailDto> {
  if (user === null) {
    throw new UserNotFoundError("该用户不存在");
  }
  const userDto = UserDetailDtoSchema.parse(user);
  const employments = await employmentRepository.getEmploymentsByUserId(userDto.id);
  const employmentDtos = [];
  for (const employment of employments) {
    const roles = await roleRepository.getRolesByEmploymentId(employment.id);
    const privileges = await privilegeRepository.getPrivilegesByRoleIds(roles.map(r => r.id));
    const employmentDto = EmploymentDetailDtoSchema.parse(toEmploymentDto(employment));
    employmentDto.roles = roles.map(r => r.roleCode);
    employmentDto.privileges = privileges.map(p => p.privilegeCode);
    employmentDtos.push(employmentDto);
  }
  userDto.employments = employmentDtos;
  userDto.roles = [...new Set(employmentDtos.flatMap(e => e.roles))];
  userDto.privileges = [...new Set(employmentDtos.flatMap(e => e.privileges))];

  return userDto;
}
