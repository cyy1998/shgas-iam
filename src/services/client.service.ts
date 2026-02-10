import { CustomError } from "@errors/CustomError"
import { redis } from "../libs/cache/redis"
import { prisma } from "@database/db"
import { clientMapper } from "@mapper/client.mapper"
import { clientRepository } from "../repositories/client.repository"
import { ClientDtoSchema, ClientVoSchema, type ClientDto, type ClientInputDto } from "@schemas/client.type"

export const clientService = {
    async getClientByCode(clientCode: string) {
        const cacheString = await redis.get(`cache:client:${clientCode}`)
        if (cacheString !== null) {
            const cacheClient: ClientDto = JSON.parse(cacheString)
            return cacheClient
        }
        const client = await clientRepository.getClientByCode(clientCode)
        if (client === null) {
            return null
        }
        // const clientVo = clientMapper.dtoToVo(clientMapper.entityToDto(client))
        const clientDto = clientMapper.entityToDto(client)
        await redis.set(`cache:client:${clientCode}`, JSON.stringify(clientDto))
        return clientDto
    },
    async updateClient(clientDto: ClientInputDto) {
        return await prisma.$transaction(async (tx) => {
            const client = await clientRepository.updateClient(clientDto, tx)
            const updatedClientDto = clientMapper.entityToDto(client)
            await redis.set(`cache:client:${updatedClientDto.clientCode}`, JSON.stringify(updatedClientDto))
            return true
        })
    },
}