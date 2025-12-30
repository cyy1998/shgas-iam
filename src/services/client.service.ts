import { prisma } from "../libs/database/prisma"
import { clientRepository } from "../repositories/client.repository"
import { ClientDtoSchema, ClientVoSchema } from "../types/client.type"

export const clientService = {
    async getClientByCode(clientCode: string) {
        const client = await clientRepository.getClientByCode(clientCode)
        const clientDto = ClientDtoSchema.parse(client)
        const clientVo = ClientVoSchema.parse(clientDto)
        return clientVo
    }
}