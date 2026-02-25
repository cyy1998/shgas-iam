import type { User } from '@prisma-client/client';
import type { UserAdminQueryDto } from '@schemas/user.admin.type';
import type { UserCreateDto } from '@schemas/user.common.type';
import { prisma } from '@database/db';
import { CustomError } from '@errors/CustomError';
import { UserNotFoundError } from '@errors/UserNotFoundError';
import { employmentAdminMapper } from '@mapper/employment.admin.mapper';
import { userAdminMapper } from '@mapper/user.admin.mapper';
import { UserAdminDetailDtoSchema } from '@schemas/user.admin.type';
import { generateRandomPassword } from '@utils/encryption.utils';
import { paginate } from '@utils/page.util';
import { hash } from 'bcrypt-ts';
import { config } from '../config';
import { employmentRepository } from '../repositories/employment.common.repository';
import { userAdminRepository } from '../repositories/user.admin.repository';
import { userRepository } from '../repositories/user.common.repository';

async function _getUserDetail(user: User | null) {
  if (user === null) {
    throw new UserNotFoundError('该用户不存在');
  }
  const userDto = UserAdminDetailDtoSchema.parse(userAdminMapper.entityToDto(user));
  const employments = await employmentRepository.getEmploymentsByUserId(userDto.id);
  const employmentVos = employments.map(e => employmentAdminMapper.dtoToVo(
    employmentAdminMapper.entityToDto(e),
  ));
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
  userDto.employments = employmentVos;
  // const roles = await roleService.getRolesByUserId(userDto.id)
  // userDto.roles = [...new Set(employmentDtos.flatMap(e => e.roles))]
  // userDto.privileges = [...new Set(employmentDtos.flatMap(e => e.privileges))]

  return userAdminMapper.dtoToVo(userDto);
}

export const userAdminService = {
  async searchUsersFuzzy(userPageQuery: UserAdminQueryDto) {
    const users = await userAdminRepository.searchUsersFuzzy(userPageQuery);
    const userDtos = users.map(u => userAdminMapper.entityToDto(u)).map(u => userAdminMapper.dtoToVo(u));
    return paginate(userDtos, userPageQuery);
  },

  async getUserDetail(username: string) {
    const user = await userAdminRepository.getUserByUsername(username);
    const userDto = _getUserDetail(user);
    return userDto;
  },

  async resetPassword(username: string) {
    return await prisma.$transaction(async (tx) => {
      const user = await userRepository.getUserByUsername(username, tx);
      if (user === null) {
        throw new UserNotFoundError('用户名不存在');
      }
      const newPassword = generateRandomPassword(8);
      const newPasswordHash = await hash(newPassword, config.PASSWORD_HASH_ROUNDS);
      await userRepository.setPassword(user.id, newPasswordHash, tx);
      return newPassword;
    });
  },

  async setUsers(userCreateDtos: UserCreateDto[]) {
    return await prisma.$transaction(async (tx) => {
      const existingUsers = await userRepository.searchUsers({ usernames: userCreateDtos.map(u => u.username) });
      if (existingUsers.length !== 0) {
        throw new CustomError('相同用户名已被注册');
      }
      for (const u of userCreateDtos) {
        u.password = await hash(u.password, config.PASSWORD_HASH_ROUNDS);
      }
      console.log(userCreateDtos);
      const users = await userAdminRepository.setUsers(userCreateDtos, tx);
      return true;
    });
  },
};
