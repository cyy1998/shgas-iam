import { User } from "../../generated/prisma"
import { UserDTO } from "../types/user.type"

export const userMapper = {
    toUserDTO(user: User): UserDTO {
        const userDTO: UserDTO = {
            id: user.id,
            username: user.username,
            name: user.name,
            mobile: user.mobilePhone,
            orcasId: null
        }
        return userDTO
    }
}