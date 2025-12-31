import { hash, compare } from 'bcrypt-ts'
import type { User } from '../../generated/prisma'
import { userRepository } from '../repositories/user.repository'
import type { UserDto } from '../types/user.type'
import { userMapper } from '../mapper/user.mapper'
import { employmentRepository } from '../repositories/employment.repository'
import { employmentMapper } from '../mapper/employment.mapper'
import { positionRepository } from '../repositories/position.repository'
import { organizationRepository } from '../repositories/organization.repository'
import { mobileService } from './mobile.service'
import { env } from '../config'
import { roleService } from './role.service'
import { mergeAndDedupe } from '../utils/common.utils'
import { privilegeService } from './privilege.service'
import { UserNotFoundError } from '../errors/UserNotFoundError'
import { CustomError } from '../errors/CustomError'
import { roleRepository } from '../repositories/role.repository'
import { prisma } from '../libs/database/prisma'
import { privilegeRepository } from '../repositories/privilege.repository'

async function _getUserDetail(user: User | null) {
    if (user === null) {
        throw new UserNotFoundError('该用户不存在')
    }
    const userDTO = userMapper.toUserDTO(user)
    const employments = await employmentRepository.getEmploymentsByUserId(userDTO.id)
    const employmentDtos = []
    for (const employment of employments) {
        const roles = await roleRepository.getRolesByEmploymentId(employment.id)
        const privileges = await privilegeRepository.getPrivilegesByRoles(roles.map(r => r.id))
        const employmentDto = employmentMapper.entityToDto(employment)
        employmentDto.roles = roles.map(r => r.roleCode)
        employmentDto.privileges = privileges.map(p => p.privilegeCode)
        employmentDtos.push(employmentDto)
    }
    userDTO.positions = employmentDtos
    const roles = await roleService.getRolesByUserId(userDTO.id)
    userDTO.roles = roles.map(r => r.roleCode)

    const privileges = await privilegeService.getPrivilegesByRoles(roles.map(r => r.roleId))
    userDTO.privileges = privileges

    return userDTO
}

function _validatePasswordStrength(password: string): boolean {
    // 检查长度是否至少为8
    if (password.length < 8) {
        return false
    }
    // 检查是否包含至少一个字母
    const hasLetter = /[a-zA-Z]/.test(password)
    // 检查是否包含至少一个数字
    const hasDigit = /\d/.test(password)
    return hasLetter && hasDigit
}

export const userService = {

    async setPassword(username: string, oldPassword: string, newPassword: string) {
        return await prisma.$transaction(async (tx) => {
            const user = await userRepository.getUserByUsername(username, tx)
            if (user === null) {
                throw new UserNotFoundError('用户名不存在')
            }
            if (oldPassword === newPassword) {
                throw new CustomError('旧密码与新密码相同')
            }
            const isMatch = await this.checkPassword(user, oldPassword)
            if (!isMatch) {
                throw new CustomError('旧密码错误')
            }
            if (!_validatePasswordStrength(newPassword)) {
                throw new CustomError('新密码强度过低')
            }
            const newPasswordHash = await hash(newPassword, env.PASSWORD_HASH_ROUNDS)
            await userRepository.setPassword(user.id, newPasswordHash, tx)
            return true
        })
    },

    async checkPassword(user: User, inputPassword: string) {
        // const user = await userRepository.getUserByUsername(userDto.username)
        return user.password ? await compare(inputPassword, user.password ?? '') : inputPassword === env.DEFAULT_USER_PASSWORD
    },

    async setMobile(userDto: UserDto, phoneNumber: string, code: string) {
        return await prisma.$transaction(async (tx) => {
            if (!mobileService.checkValidPhoneNumber(phoneNumber)) {
                throw new CustomError('无效手机号')
            }
            if (await mobileService.checkExistingPhoneNumber(phoneNumber)) {
                throw new CustomError('手机号已存在')
            }
            if (!await mobileService.cehckVerificationCode(phoneNumber, code)) {
                throw new CustomError('验证码错误')
            }
            await userRepository.setMobile(userDto.id, phoneNumber, tx)
            userDto.mobile = phoneNumber
            return userDto
        })
    },

    async getUserDetailByUsername(username: string) {
        const user = await userRepository.getUserByUsername(username)
        const userDetail = await _getUserDetail(user)
        return userDetail
    },

    async getUserDetailByMobile(mobile: string) {
        const user = await userRepository.getUserByMobile(mobile)
        const userDetail = await _getUserDetail(user)
        return userDetail
    },

    async getUserDetailByWxId(wxId: string) {
        const user = await userRepository.getUserByWxId(wxId)
        const userDetail = await _getUserDetail(user)
        return userDetail
    },

    async getOtherUsersByOrg(orgCode: string, userDTO: UserDto) {
        const users = await userRepository.getOtherUsersByOrgAndAllSub(userDTO.id, orgCode)
        const userDTOs = users.map(u => userMapper.toUserDTO(u))
        return userDTOs
    },

    async getUsersByOrg(orgCode: string, orgScope: string) {
        const users = orgScope === 'direct' ? await userRepository.getUsersByOrg(orgCode) :
            await userRepository.getUsersByOrgAndAllSub(orgCode)
        const userDTOs = users.map(u => userMapper.toUserDTO(u))
        return userDTOs
    },

    async getUsersByOrgRole(orgCode: string, roleCode: string, orgScope: string) {
        const users = orgScope === 'direct' ? await userRepository.getUsersByOrgRole(orgCode, roleCode) :
            await userRepository.getUsersByOrgAndAllSubRole(orgCode, roleCode)
        const userDTOs = users.map(u => userMapper.toUserDTO(u))
        return userDTOs
    },

    async getUsersByOrgPos(orgCode: string, roleCode: string, orgScope: string) {
        const users = orgScope === 'direct' ? await userRepository.getUsersByOrgPos(orgCode, roleCode) :
            await userRepository.getUsersByOrgAndAllSubPos(orgCode, roleCode)
        const userDTOs = users.map(u => userMapper.toUserDTO(u))
        return userDTOs
    },

    async registerPurveyorConcat(username: string, mobile: string, name: string, orgCode: string) {
        await prisma.$transaction(async (tx) => {
            const existingUser = await userRepository.getUserByMobile(mobile, tx)
            const [pos, comp, org] = await Promise.all([
                positionRepository.getPositionByCode('P001', tx),
                organizationRepository.getOrganizationByCode(env.PURVEYOR_PARENT_ORG, tx),
                organizationRepository.getOrganizationByCode(orgCode, tx)
            ])
            if (org === null) {
                throw new CustomError('供应商尚未注册')
            }
            if (pos === null || comp === null) {
                throw new CustomError('系统基本信息缺失')
            }
            if (existingUser !== null) {
                const existingEmployment = await employmentRepository.getEmploymentByUserOrgPosId(existingUser.id, org.id, pos.id, tx)
                if (existingEmployment === null) {
                    await employmentRepository.setEmployment(existingUser.id, pos.id, org.id, comp.id, tx)
                }
            }
            else {
                const user = await userRepository.setUser(username, name, mobile, '外部用户', tx)
                await employmentRepository.setEmployment(user.id, pos.id, org.id, comp.id, tx)
            }
        })
        if (env.NODE_ENV === 'production') {
            await mobileService.sendMessage(mobile, mobileService.getPurveyorWelcomeMessage(name))
        }
        return true
    },
}