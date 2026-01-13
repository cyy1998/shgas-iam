import type { z } from "@hono/zod-openapi";
import { userMapper } from "../mapper/user.common.mapper";
import { userRepository } from "../repositories/user.common.repository";
import type { PageQuery } from "../types/page.type";
import { UserAdminDetailDtoSchema, type UserAdminQueryDto } from "../types/user.admin.type";
import { paginate } from "../utils/page.util";
import { UserNotFoundError } from "../errors/UserNotFoundError";
import { userAdminMapper } from "../mapper/user.admin.mapper";
import type { User } from "../../generated/prisma";
import { employmentRepository } from "../repositories/employment.common.repository";
import { roleRepository } from "../repositories/role.repository";
import { privilegeRepository } from "../repositories/privilege.repository";
import { EmploymentAdminDetailDtoSchema } from "../types/employment.admin.type";
import { employmentAdminMapper } from "../mapper/employment.admin.mapper";
import { userAdminRepository } from "../repositories/user.admin.repository";

async function _getUserDetail(user: User | null) {
    if (user === null) {
        throw new UserNotFoundError('该用户不存在')
    }
    const userDto = UserAdminDetailDtoSchema.parse(userAdminMapper.entityToDto(user))
    const employments = await employmentRepository.getEmploymentsByUserId(userDto.id)
    const employmentVos = employments.map(e => employmentAdminMapper.dtoToVo(
        employmentAdminMapper.entityToDto(e)
    ))
    // for (const employment of employments) {
    //     // const roles = await roleRepository.getRolesByEmploymentId(employment.id)
    //     // const privileges = await privilegeRepository.getPrivilegesByRoleIds(roles.map(r => r.id))
    //     // console.log(roles.map(r => r.id))
    //     // console.log(roles.map(r => r.roleCode))
    //     // console.log(privileges.map(p => p.privilegeCode))
    //     const employmentDto = employmentAdminMapper.entityToDto(employment)
    //     // employmentDto.roles = roles.map(r => r.roleCode)
    //     // employmentDto.privileges = privileges.map(p => p.privilegeCode)
    //     employmentDtos.push(employmentDto)
    // }
    userDto.employments = employmentVos
    // const roles = await roleService.getRolesByUserId(userDto.id)
    // userDto.roles = [...new Set(employmentDtos.flatMap(e => e.roles))]
    // userDto.privileges = [...new Set(employmentDtos.flatMap(e => e.privileges))]


    return userAdminMapper.dtoToVo(userDto)
}


export const adminService = {
    async searchUsersFuzzy(userPageQuery: UserAdminQueryDto) {
        const users = await userAdminRepository.searchUsersFuzzy(userPageQuery)
        const userDtos = users.map(u => userAdminMapper.entityToDto(u)).map(u => userAdminMapper.dtoToVo(u))
        return paginate(userDtos, userPageQuery)
    },

    async getUserDetail(username: string) {
        const user = await userAdminRepository.getUserByUsername(username)
        const userDto = _getUserDetail(user)
        return userDto
    }
}