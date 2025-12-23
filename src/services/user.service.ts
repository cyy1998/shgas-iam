import { redis, prisma } from '../extensions'
import { hash, compare } from 'bcrypt-ts'
import { ServiceStatusCode } from "../constants/service.status"
import type { User } from '../../generated/prisma'
import type { ServiceResult } from '../types/service.type'
import { userRepository } from '../repositories/user.repository'
import type { UserDTO } from '../types/user.type'
import { userMapper } from '../mapper/user.mapper'
import { employmentRepository } from '../repositories/employment.repository'
import { employmentMapper } from '../mapper/employment.mapper'
import { positionRepository } from '../repositories/position.repository'
import { organizationRepository } from '../repositories/organization.repository'
import { mobileService } from './mobile.service'
import { env } from '../config'
import { roleService } from './role.service'
import { mergeAndDedupe } from '../utils'
import { privilegeService } from './privilege.service'
import { UserNotFoundError } from '../errors/UserNotFoundError'

async function _getUserDetail(user: User) {
    const userDTO = userMapper.toUserDTO(user)
    const employments = await employmentRepository.getEmploymentsByUserId(userDTO.id)
    userDTO.positions = employments.map(e => employmentMapper.toEmploymentDTO(e))

    const deptIds = employments.map(e => e.deptId)
    const posIds = employments.map(e => e.posId)
    const posDeptIds = employments.map(e => { return { posId: e.posId, orgId: e.deptId } })

    const rolesFromDepts = await Promise.all(deptIds.map(e => roleService.getRolesByOrganization(e)))
    const rolesFromPosition = await Promise.all(posIds.map(e => roleService.getRolesByPosition(e)))
    const rolesFromPosOrg = await Promise.all(posDeptIds.map(e => roleService.getRolesByOrgPosition(e.posId, e.orgId)))
    const rolesFromEmployment = await Promise.all(employments.map(e => roleService.getRolesByEmployment(e.id)))
    const rolesCombined = [...rolesFromDepts, ...rolesFromPosition, ...rolesFromPosOrg, ...rolesFromEmployment]
    const roles = rolesCombined.reduce((acc, cur) => mergeAndDedupe(acc, cur, 'roleId'), [])
    userDTO.roles = roles

    const privileges = await privilegeService.getPrivilegesByRoles(roles.map(r => r.roleId))
    userDTO.privileges = privileges

    return userDTO
}

export const userService = {

    async setPassword(userDTO: UserDTO, oldPassword: string, newPassword: string): Promise<ServiceResult> {
        // const user = await userRepository.getUserByUsername(userDTO.username)
        // if (user === null) {
        //     return {
        //         code: ServiceStatusCode.Failure,
        //         data: {},
        //         message: '用户不存在'
        //     }
        // }
        if (oldPassword === newPassword) {
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: '旧密码与新密码相同'
            }
        }
        const isMatch = await this.checkPassword(userDTO, oldPassword)
        if (!isMatch) {
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: '旧密码错误'
            }
        }
        if (!this.validatePasswordStrength(newPassword)) {
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: '新密码强度过低'
            }
        }
        const newPasswordHash = await hash(newPassword, env.PASSWORD_HASH_ROUNDS)
        await userRepository.setPassword(userDTO.id, newPasswordHash)
        return {
            code: ServiceStatusCode.Success,
            data: {},
            message: 'success'
        }

    },

    async checkPassword(userDTO: UserDTO, inputPassword: string): Promise<boolean> {
        const user = await userRepository.getUserByUsername(userDTO.username)
        if (user === null) {
            return false
        }
        return user.password ? await compare(inputPassword, user.password ?? '') : inputPassword === env.DEFAULT_USER_PASSWORD
    },

    async setMobile(userDTO: UserDTO, newMobile: string): Promise<UserDTO> {

        const userUpdated = await prisma.user.update({
            where: {
                id: userDTO.id
            },
            data: {
                mobilePhone: newMobile
            }
        })
        userDTO.mobile = newMobile
        return userDTO
    },

    async getUserDetailByUsername(username: string) {
        const user = await userRepository.getUserByUsername(username)
        if (user === null) {
            throw new UserNotFoundError()
            // return {
            //     code: ServiceStatusCode.Failure,
            //     data: null,
            //     message: 'User Not Found'
            // }
        }
        const data = await _getUserDetail(user)
        return {
            code: ServiceStatusCode.Success,
            data: data,
            message: 'success'
        }
    },

    async getUserDetailByMobile(mobile: string) {
        const user = await userRepository.getUserByMobile(mobile)
        if (user === null) {
            return {
                code: ServiceStatusCode.Failure,
                data: null,
                message: 'User Not Found'
            }
        }
        const data = await _getUserDetail(user)
        return {
            code: ServiceStatusCode.Success,
            data: data,
            message: 'success'
        }
    },

    async getUserDetailByWxId(wxId: string) {
        const user = await userRepository.getUserByWxId(wxId)
        if (user === null) {
            return {
                code: ServiceStatusCode.Failure,
                data: null,
                message: 'User Not Found'
            }
        }
        const data = await _getUserDetail(user)
        return {
            code: ServiceStatusCode.Success,
            data: data,
            message: 'success'
        }
    },

    async searchOtherUserUnderOrg(orgCode: string, userDTO: UserDTO): Promise<ServiceResult> {
        const users = await userRepository.searchOtherUsersUnderOrg(userDTO.id, orgCode)
        const userDTOs = users.map(u => userMapper.toUserDTO(u))
        return {
            code: ServiceStatusCode.Success,
            data: userDTOs,
            message: 'success'
        }
    },

    async searchUsersUnderOrg(orgCode: string, orgScope: string): Promise<ServiceResult> {
        if (orgScope === 'direct') {
            const users = await userRepository.searchUsersUnderOrgDirect(orgCode)
            const userDTOs = users.map(u => userMapper.toUserDTO(u))
            return {
                code: ServiceStatusCode.Success,
                data: userDTOs,
                message: 'success'
            }
        }
        else if (orgScope == 'recursive') {
            const users = await userRepository.searchUsersUnderOrgRecursive(orgCode)
            const userDTOs = users.map(u => userMapper.toUserDTO(u))
            return {
                code: ServiceStatusCode.Success,
                data: userDTOs,
                message: 'success'
            }
        }
        else {
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: 'Invalid OrgScope'
            }
        }
    },

    async searchUserByOrgRole(orgCode: string, roleCode: string, orgScope: string): Promise<ServiceResult> {
        if (orgScope === 'direct') {
            const users = await userRepository.searchUsersByOrgRoleDirect(orgCode, roleCode)
            const userDTOs = users.map(u => userMapper.toUserDTO(u))
            return {
                code: ServiceStatusCode.Success,
                data: userDTOs,
                message: 'success'
            }
        }
        else if (orgScope == 'recursive') {
            const users = await userRepository.searchUsersByOrgRoleRecursive(orgCode, roleCode)
            const userDTOs = users.map(u => userMapper.toUserDTO(u))
            return {
                code: ServiceStatusCode.Success,
                data: userDTOs,
                message: 'success'
            }
        }
        else {
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: 'Invalid OrgScope'
            }
        }


    },
    async searchUserByOrgPos(orgCode: string, roleCode: string, orgScope: string): Promise<ServiceResult> {
        if (orgScope === 'direct') {
            const users = await userRepository.searchUsersByOrgPosDirect(orgCode, roleCode)
            const userDTOs = users.map(u => userMapper.toUserDTO(u))
            return {
                code: ServiceStatusCode.Success,
                data: userDTOs,
                message: 'success'
            }
        }
        else if (orgScope == 'recursive') {
            const users = await userRepository.searchUsersByOrgPosRecursive(orgCode, roleCode)
            const userDTOs = users.map(u => userMapper.toUserDTO(u))
            return {
                code: ServiceStatusCode.Success,
                data: userDTOs,
                message: 'success'
            }
        }
        else {
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: 'Invalid OrgScope'
            }
        }


    },
    async purveyorConcatRegister(username: string, mobile: string, name: string, orgCode: string) {
        const existingUser = await userRepository.getUserByMobile(mobile)
        const [pos, comp, org] = await Promise.all([
            positionRepository.getPositionByCode('P001'),
            organizationRepository.getOrganizationByCode('GY'),
            organizationRepository.getOrganizationByCode(orgCode)
        ])
        if (org === null) {
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: '供应商未注册'
            }
        }
        if (pos === null || comp === null) {
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: '系统基本信息缺失'
            }
        }
        if (existingUser !== null) {
            const existingEmployment = await employmentRepository.getEmploymentsByUserOrgPos(existingUser.id, org.id, pos.id)

            if (existingEmployment === null) {
                const employment = await employmentRepository.setEmployment(existingUser.id, pos.id, org.id, comp.id)
            }
        }
        else {
            const user = await userRepository.setUser(username, name, mobile, '外部用户')
            const employment = await employmentRepository.setEmployment(user.id, pos.id, org.id, comp.id)
        }
        if (env.NODE_ENV === 'production') {
            await mobileService.sendMessage(mobile, mobileService.getPurveyorWelcomeMessage(name))
        }
        return {
            code: ServiceStatusCode.Success,
            data: {},
            message: 'success'
        }
    },
    validatePasswordStrength(password: string): boolean {
        // 检查长度是否至少为8
        if (password.length < 8) {
            return false;
        }

        // 检查是否包含至少一个字母
        const hasLetter = /[a-zA-Z]/.test(password);

        // 检查是否包含至少一个数字
        const hasDigit = /\d/.test(password);

        return hasLetter && hasDigit;
    }
}