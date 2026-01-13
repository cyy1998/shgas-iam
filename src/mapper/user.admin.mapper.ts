import type { User } from "../../generated/prisma"
import { userStatusToString } from "../constants/user.status"
import type { UserAdminDto, UserAdminVo } from "../types/user.admin.type"

export const userAdminMapper = {
    entityToDto(user: User): UserAdminDto {
        return {
            id: user.id,
            username: user.username,
            name: user.name,
            mobile: user.mobilePhone,
            wxId: user.wxId,
            userType: user.userType,
            status: user.status,
            orderNum: user.orderNum,
            orcasId: null,
            createTime: user.createTime.toISOString(),
            updateTime: user.updateTime.toISOString()
        }
    },
    dtoToVo(userDto: UserAdminDto): UserAdminVo {
        return {
            ...userDto,
            statusText: userStatusToString[userDto.status]
        }
    }
}