import type { UserDto } from "@schemas/user.common.type";
import type { User } from "@/db/generated/prisma/client";

export const userMapper = {
  entityToDto(user: User): UserDto {
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
    };
  },
};
