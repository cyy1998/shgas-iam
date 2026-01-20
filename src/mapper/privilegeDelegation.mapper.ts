import type { PrivilegeDelegationEntity } from "../types/privilegeDelegation.entity.type"
import type { PrivilegeDelegationDto } from "../types/privilegeDelegation.type"

export const privilegeDelegationMapper = {
    entityToDto(pd: PrivilegeDelegationEntity): PrivilegeDelegationDto {
        return {
            id: pd.id,
            delegateeUserId: pd.delegateeUserId,
            delegateeUsername: pd.delegateeUser.username,
            delegateeName: pd.delegateeUser.name,
            delegatorUserId: pd.delegatorUserId,
            delegatorUsername: pd.delegatorUser.username,
            delegatorName: pd.delegatorUser.name
        }
    }
}