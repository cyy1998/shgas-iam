import { CustomError } from "../errors/CustomError"
import { prisma } from "../libs/database/prisma"
import { clientMapper } from "../mapper/client.mapper"
import { clientRepository } from "../repositories/client.repository"
import { ClientDtoSchema, ClientVoSchema } from "../types/client.type"

export const clientService = {
    async getClientByCode(clientCode: string) {
        const client = await clientRepository.getClientByCode(clientCode)
        if (client === null) {
            throw new CustomError('client不存在')
        }
        const clientVo = clientMapper.dtoToVo(clientMapper.entityToDto(client))
        return clientVo
    }
}