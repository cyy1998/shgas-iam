import type { User } from "@database/client"
import type { UserDto } from "../types/user.common.type"

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
            orcasId: null
        }
    }
}