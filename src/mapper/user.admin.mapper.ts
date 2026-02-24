import type { User } from '@prisma-client/client';
import type { UserAdminDto, UserAdminVo } from '@schemas/user.admin.type';
import { userStatusToString } from '@constants/user.status';

export const userAdminMapper = {
  entityToDto(user: User): UserAdminDto {
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      mobile: user.mobile,
      wxId: user.wxId,
      userType: user.userType,
      status: user.status,
      orderNum: user.orderNum,
      orcasId: null,
      createTime: user.createTime.toISOString(),
      updateTime: user.updateTime.toISOString(),
    };
  },
  dtoToVo(userDto: UserAdminDto): UserAdminVo {
    return {
      ...userDto,
      statusText: userStatusToString[userDto.status],
    };
  },
};
