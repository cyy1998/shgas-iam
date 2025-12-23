import type { User } from "../../generated/prisma"
import type { UserDTO } from "../types/user.type"

export const userMapper = {
    toUserDTO(user: User): UserDTO {
        const userDTO: UserDTO = {
            id: user.id,
            username: user.username,
            name: user.name,
            mobile: user.mobilePhone,
            userType: user.userType,
            orcasId: null
        }
        return userDTO
    }
}