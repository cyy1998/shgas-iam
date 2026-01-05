import type { Client } from "../../generated/prisma";
import { ClientStatus } from "../constants/client.status";
import type { ClientDto, ClientVo } from "../types/client.type";

export const clientMapper = {
    entityToDto(entity: Client): ClientDto {
        return {
            id: entity.id,
            clientCode: entity.clientCode,
            clientName: entity.clientName,
            url: entity.url,
            status: entity.status,
            extAttributes: typeof entity.extAttributes === 'string' ? JSON.parse(entity.extAttributes) : entity.extAttributes
        }
    },
    dtoToVo(dto: ClientDto): ClientVo {
        return {
            clientId: dto.id,
            clientCode: dto.clientCode,
            clientName: dto.clientName,
            status: dto.status,
            statusText: ClientStatus[dto.status],
            extAttributes: dto.extAttributes
        }
    }
}