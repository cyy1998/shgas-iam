import { redis, prisma } from '../extensions'
import axios from 'axios'
import { hash, compare } from 'bcrypt-ts'
import { DEFAULT_USER_PASSWORD, EmploymentStatus, PASSWORD_HASH_ROUNDS, PURVEYOR_ORG_PRFFIX, RUN_MODE, ServiceStatusCode } from '../constant'
import { User } from '../../generated/prisma'
import { use } from 'react'
import { ServiceResult } from '../types/service.type'
import { userRepository } from '../repositories/user.repository'
import { UserDTO } from '../types/user.type'
import { userMapper } from '../mapper/user.mapper'
import { employmentRepository } from '../repositories/employment.repository'
import { privilegeRepository } from '../repositories/privilege.repository'
import { employmentMapper } from '../mapper/employment.mapper'
import { privilegeMapper } from '../mapper/privilege.mapper'
import { roleRepository } from '../repositories/role.repository'
import { roleMapper } from '../mapper/role.mapper'
import { positionRepository } from '../repositories/position.repository'
import { organizationRepository } from '../repositories/organization.repository'
import { mobileService } from './mobile.service'

export const userService = {

    async setPassword(userDTO: UserDTO, oldPassword: string, newPassword: string): Promise<ServiceResult> {
        const user = await userRepository.getUserByUsername(userDTO.username)
        if (user === null) {
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: '用户不存在'
            }
        }
        const isMatch = this.checkPassword(user, oldPassword)
        if (!isMatch) {
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: '旧密码错误'
            }
        }

        const newPasswordHash = await hash(newPassword, PASSWORD_HASH_ROUNDS)
        await userRepository.setPassword(userDTO.id, newPasswordHash)
        return {
            code: ServiceStatusCode.Success,
            data: {},
            message: 'success'
        }

    },

    async checkPassword(user: User, inputPassword: string): Promise<boolean> {
        //console.log(inputPassword, DEFAULT_USER_PASSWORD, user.password, inputPassword === DEFAULT_USER_PASSWORD)
        return user.password ? await compare(inputPassword, user.password ?? '') : inputPassword === DEFAULT_USER_PASSWORD
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
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: 'User Not Found'
            }
        }
        const userDTO = userMapper.toUserDTO(user)
        const positions = await employmentRepository.getEmploymentsByUserId(userDTO.id)
        const privileges = await privilegeRepository.getPrivilegesByUserId(userDTO.id)
        const roles = await roleRepository.getRoleByUserId(userDTO.id)
        userDTO.positions = positions.map(e => employmentMapper.toEmploymentDTO(e))
        userDTO.privileges = privileges.map(p => privilegeMapper.toPrivilegeDTO(p))
        userDTO.roles = roles.map(r => roleMapper.toRoleDTO(r))
        return {
            code: ServiceStatusCode.Success,
            data: userDTO,
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
            organizationRepository.getOrganizationByCode(PURVEYOR_ORG_PRFFIX),
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
            const existingEmployment = employmentRepository.getEmploymentsByUserOrgPos(existingUser.id, org.id, pos.id)
            if (existingEmployment === null) {
                const employment = await employmentRepository.setEmployment(existingUser.id, pos.id, org.id, comp.id)
            }
        }
        else {
            const user = await userRepository.setUser(username, name, mobile, '外部用户')
            const employment = await employmentRepository.setEmployment(user.id, pos.id, org.id, comp.id)
        }
        if (RUN_MODE === 'production' || RUN_MODE === 'development') {
            await mobileService.sendMessage(mobile, mobileService.getPurveyorWelcomeMessage(name))
        }
        return {
            code: ServiceStatusCode.Success,
            data: {},
            message: 'success'
        }
    }
}