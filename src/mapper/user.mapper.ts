import type { User } from "../../generated/prisma"
import type { UserDto } from "../types/user.type"

export const userMapper = {
    entityToDto(user: User): UserDto {
        return {
            id: user.id,
            username: user.username,
            name: user.name,
            mobile: user.mobilePhone,
            userType: user.userType,
            status: user.status,
            orderNum: user.orderNum,
            orcasId: null
        }
    }
}