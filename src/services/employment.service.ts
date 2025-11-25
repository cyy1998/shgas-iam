import { ServiceStatusCode } from "../constant";
import { employmentMapper } from "../mapper/employment.mapper";
import { employmentRepository } from "../repositories/employment.repository";
import { ServiceResult } from "../types/service.type";
import { UserDTO } from "../types/user.type";

export const employmentService = {
    async getEmploymentsByUserAndPrivilege(username: string, privCode: string, codeType: string): Promise<ServiceResult> {
        let privCondition = null
        if (codeType === 'full') {
            privCondition = privCode
        } else if (codeType === 'prefix') {
            privCondition = {
                startsWith: privCode
            }
        } else {
            privCondition = {
                endsWith: privCode
            }
        }
        const employments = await employmentRepository.getEmploymentsByUserAndPrivilege(username, privCondition)
        const employmentDTOs = employments.map(e => employmentMapper.toEmploymentDTO(e))
        return {
            code: ServiceStatusCode.Success,
            data: employmentDTOs,
            message: 'success'
        }
    }

}