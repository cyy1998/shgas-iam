import type { User } from '@prisma-client/client';
import type { UserDetailDto, UserQueryDto, UserQueryWithPrivilegeDelegationDto } from '@schemas/user.common.type';
import { UserType } from '@constants/user.type';
import { VerificationCodeUsage } from '@constants/verificationCode.usage';
import { prisma } from '@database/db';
import { CustomError } from '@errors/CustomError';
import { UserNotFoundError } from '@errors/UserNotFoundError';
import { employmentMapper } from '@mapper/employment.common.mapper';
import { privilegeDelegationMapper } from '@mapper/privilegeDelegation.mapper';
import { userMapper } from '@mapper/user.common.mapper';
import { EmploymentDetailDtoSchema } from '@schemas/employment.common.type';
import {
  UserDetailDtoSchema,

} from '@schemas/user.common.type';
import { compare, hash } from 'bcrypt-ts';
import { config } from '../config';
import { employmentRepository } from '../repositories/employment.common.repository';
import { organizationRepository } from '../repositories/organization.repository';
import { positionRepository } from '../repositories/position.common.repository';
import { privilegeRepository } from '../repositories/privilege.repository';
import { privilegeDelegationRepository } from '../repositories/privilegeDelegation.repository';
import { roleRepository } from '../repositories/role.repository';
import { userRepository } from '../repositories/user.common.repository';
import { mobileService } from './mobile.service';

async function _getUserDetail(user: User | null): Promise<UserDetailDto> {
  if (user === null) {
    throw new UserNotFoundError('该用户不存在');
  }
  const userDto = UserDetailDtoSchema.parse(userMapper.entityToDto(user));
  const employments = await employmentRepository.getEmploymentsByUserId(userDto.id);
  const employmentDtos = [];
  for (const employment of employments) {
    const roles = await roleRepository.getRolesByEmploymentId(employment.id);
    const privileges = await privilegeRepository.getPrivilegesByRoleIds(roles.map(r => r.id));
    const employmentDto = EmploymentDetailDtoSchema.parse(employmentMapper.entityToDto(employment));
    employmentDto.roles = roles.map(r => r.roleCode);
    employmentDto.privileges = privileges.map(p => p.privilegeCode);
    employmentDtos.push(employmentDto);
  }
  userDto.employments = employmentDtos;
  userDto.roles = [...new Set(employmentDtos.flatMap(e => e.roles))];
  userDto.privileges = [...new Set(employmentDtos.flatMap(e => e.privileges))];

  return userDto;
}

function _validatePasswordStrength(password: string): boolean {
  // 检查长度是否至少为8
  if (password.length < 8) {
    return false;
  }
  // 检查是否包含至少一个字母
  const hasLetter = /[a-z]/i.test(password);
  // 检查是否包含至少一个数字
  const hasDigit = /\d/.test(password);
  return hasLetter && hasDigit;
}

export const userService = {

  async setPassword(username: string, oldPassword: string, newPassword: string) {
    return await prisma.$transaction(async (tx) => {
      const user = await userRepository.getUserByUsername(username, tx);
      if (user === null) {
        throw new UserNotFoundError('用户名不存在');
      }
      if (oldPassword === newPassword) {
        throw new CustomError('旧密码与新密码相同');
      }
      const isMatch = await this.checkPassword(user.username, oldPassword);
      if (!isMatch) {
        throw new CustomError('旧密码错误');
      }
      if (!_validatePasswordStrength(newPassword)) {
        throw new CustomError('新密码强度过低');
      }
      const newPasswordHash = await hash(newPassword, config.PASSWORD_HASH_ROUNDS);
      await userRepository.setPassword(user.id, newPasswordHash, tx);
      return true;
    });
  },

  async resetPassword(username: string, phone: string, code: string, newPassword: string) {
    return await prisma.$transaction(async (tx) => {
      const user = await userRepository.getUserByUsername(username, tx);
      if (user === null) {
        throw new UserNotFoundError('用户不存在');
      }
      if (user.mobile !== phone) {
        throw new UserNotFoundError('用户名与手机号不匹配');
      }
      if (!mobileService.cehckVerificationCode('resetPassword', phone, code)) {
        throw new UserNotFoundError('验证码错误');
      }
      const newPasswordHash = await hash(newPassword, config.PASSWORD_HASH_ROUNDS);
      await userRepository.setPassword(user.id, newPasswordHash, tx);
      return true;
    });
  },

  async checkPassword(username: string, inputPassword: string) {
    const user = await userRepository.getUserByUsername(username);
    if (user === null) {
      throw new UserNotFoundError('用户不存在');
    }
    if (user.password === null && config.NODE_ENV === 'production') {
      return false;
    }
    return user.password ? await compare(inputPassword, user.password ?? '') : inputPassword === config.DEFAULT_USER_PASSWORD;
  },

  async setMobile(userId: number, phoneNumber: string, code: string) {
    await prisma.$transaction(async (tx) => {
      if (!mobileService.checkValidPhoneNumber(phoneNumber)) {
        throw new CustomError('无效手机号');
      }
      if (await mobileService.checkExistingPhoneNumber(phoneNumber)) {
        throw new CustomError('手机号已存在');
      }
      if (!await mobileService.cehckVerificationCode(VerificationCodeUsage.BindPhone, phoneNumber, code)) {
        throw new CustomError('验证码错误');
      }
      await userRepository.setMobile(userId, phoneNumber, tx);
    });
    return await this.getUserDetailById(userId);
  },
  async searchUsers(userQueryDto: UserQueryDto) {
    const users = await userRepository.searchUsers(userQueryDto);
    const userDtos = users.map(u => userMapper.entityToDto(u));
    return userDtos;
  },
  async searchUsersWithPrivilegeDelegation(userQueryWithPrivilegeDelegationDto: UserQueryWithPrivilegeDelegationDto) {
    if (userQueryWithPrivilegeDelegationDto.ancestorOrgCodes.length !== 1) {
      throw new CustomError('该接口ancestorOrgCodes元素数量只支持为1');
    }
    const users = await userRepository.searchUsers(userQueryWithPrivilegeDelegationDto);
    const userDtos = users.map(u => userMapper.entityToDto(u));
    const orgCode = userQueryWithPrivilegeDelegationDto.ancestorOrgCodes[0] as string;
    const privCode = userQueryWithPrivilegeDelegationDto.privilegeCode;
    const delegations = (await privilegeDelegationRepository.getDelegationsByUserAndOrganizationScopeAndPrivilege(
      userDtos.map(u => u.username),
      orgCode,
      privCode,
    )).map(pd => privilegeDelegationMapper.entityToDto(pd));
    return {
      users: userDtos,
      delegations,
    };
  },
  async searchUsersRawSql(userQueryDto: UserQueryDto) {
    const users = await userRepository.searchUsersRawSql(userQueryDto);
    const userDtos = users.map(u => userMapper.entityToDto(u));
    return userDtos;
  },

  async getUserDetailById(userId: number): Promise<UserDetailDto> {
    const user = await userRepository.getUserById(userId);
    const userDetail = await _getUserDetail(user);
    return userDetail;
  },

  async getUserDetailByUsername(username: string): Promise<UserDetailDto> {
    const user = await userRepository.getUserByUsername(username);
    const userDetail = await _getUserDetail(user);
    return userDetail;
  },

  async getUserDetailByMobile(mobile: string): Promise<UserDetailDto> {
    const user = await userRepository.getUserByMobile(mobile);
    const userDetail = await _getUserDetail(user);
    return userDetail;
  },

  async getUserDetailByWxId(wxId: string): Promise<UserDetailDto> {
    const user = await userRepository.getUserByWxId(wxId);
    const userDetail = await _getUserDetail(user);
    return userDetail;
  },

  async getOtherUsersByOrg(orgCode: string, userId: number) {
    const users = await userRepository.getOtherUsersByOrgAndAllSub(userId, orgCode);
    const userDtos = users.map(u => userMapper.entityToDto(u));
    return userDtos;
  },

  async getUsersByOrg(orgCode: string, orgScope: string) {
    const users = orgScope === 'direct'
      ? await userRepository.getUsersByOrg(orgCode)
      : await userRepository.getUsersByOrgAndAllSub(orgCode);
    const userDtos = users.map(u => userMapper.entityToDto(u));
    return userDtos;
  },

  async getUsersByOrgRole(orgCode: string, roleCode: string, orgScope: string) {
    const users = orgScope === 'direct'
      ? await userRepository.getUsersByOrgRole(orgCode, roleCode)
      : await userRepository.getUsersByOrgAndAllSubRole(orgCode, roleCode);
    const userDtos = users.map(u => userMapper.entityToDto(u));
    return userDtos;
  },

  async getUsersByOrgPos(orgCode: string, roleCode: string, orgScope: string) {
    const users = orgScope === 'direct'
      ? await userRepository.getUsersByOrgPos(orgCode, roleCode)
      : await userRepository.getUsersByOrgAndAllSubPos(orgCode, roleCode);
    const userDtos = users.map(u => userMapper.entityToDto(u));
    return userDtos;
  },

  async getUsersByOrgPosWithDelegation(orgCode: string, roleCode: string, orgScope: string, privCode: string) {
    const userDtos = this.getUsersByOrgPos(orgCode, roleCode, orgScope);
    return userDtos;
  },

  async registerPurveyorConcat(username: string, mobile: string, name: string, orgCode: string) {
    await prisma.$transaction(async (tx) => {
      const existingUser = await userRepository.getUserByMobile(mobile, tx);
      const [pos, comp, org] = await Promise.all([
        positionRepository.getPositionByCode('P001', tx),
        organizationRepository.getOrganizationByCode(config.PURVEYOR_PARENT_ORG, tx),
        organizationRepository.getOrganizationByCode(orgCode, tx),
      ]);
      if (org === null) {
        throw new CustomError('供应商尚未注册');
      }
      if (pos === null || comp === null) {
        throw new CustomError('系统基本信息缺失');
      }
      if (existingUser !== null) {
        const existingEmployment = await employmentRepository.getEmploymentByUserOrgPosId(existingUser.id, org.id, pos.id, tx);
        if (existingEmployment === null) {
          await employmentRepository.setEmployment(existingUser.id, pos.id, org.id, comp.id, tx);
        }
      }
      else {
        const user = await userRepository.setUser(username, name, mobile, UserType.External, tx);
        await employmentRepository.setEmployment(user.id, pos.id, org.id, comp.id, tx);
      }
    });
    if (config.NODE_ENV === 'production') {
      await mobileService.sendMessage(mobile, mobileService.getPurveyorWelcomeMessage(name));
    }
    return true;
  },
};
