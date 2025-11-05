import { Prisma, Organization, Position, User, Privilege, Employment } from "./generated/prisma"


type EmploymentDetail = Prisma.EmploymentGetPayload<{
    include: {
        position: true,
        deptartment: true,
        company: true
    }

}>

// type UserWithPosition = Prisma.UserGetPayload<{
//     include: {
//         positions: {
//             include: {
//                 position: {
//                     include: {
//                         organization: true
//                     }
//                 }
//             }
//         }
//     };
// }>;

type PrivilegeWithObject = Prisma.PrivilegeGetPayload<{
    include: {
        object: true
    }
}>;

// type UserPositionRelation = Prisma.UserPositionGetPayload<{
//     include: {
//         user: true,
//         position: true
//     };
// }>;

export interface OrganizationQuery {
    parentId?: number
    orgCode?: string
}

export interface OrgDTO {
    id: number
    orgCode: string
    orgName: string
    orgType: string
    level: number
}

export interface PrivDTO {
    id: number
    privCode: string
    privName: string
    objType: string
    path: string
}

export interface EmploymentDTO {
    id: number
    posId: number
    posCode: string
    posName: string
    orgId: number
    orgCode: string
    orgName: string
    compId: number
    compCode: string
    compName: string
}

export interface UserDTO {
    id: number
    username: string
    name: string
    mobile: string | null
    positions?: EmploymentDTO[]
    privileges?: PrivDTO[]
    companies?: OrgDTO[]
}

export interface DelegationDTO {
    delegatorId: number
    delegatorUsername: string
    delegatorName: string
    delegateeId: number
    delegateeUsername: string
    delegateeName: string
}

export interface PosDTO {
    posId: number
    posCode: string
    posName: string,
    orgId: number,
    orgCode: string,
    orgName: string
}

export function getPrivDTO(priv: PrivilegeWithObject): PrivDTO {
    return {
        id: priv.id,
        privCode: priv.privilegeCode,
        privName: priv.privilegeName,
        objType: priv.object.objectType,
        path: priv.object.path ?? 'none',
    }
}

export function getOrgDTO(org: Organization): OrgDTO {
    return {
        id: org.id,
        orgCode: org.orgCode,
        orgName: org.orgName,
        orgType: org.orgType,
        level: org.level
    }
}

// export function getPostDTO(post: PositionwithOrg): PosDTO {
//     return {
//         posId: post.id,
//         posCode: post.postCode,
//         posName: post.postName,
//         orgId: post.orgId,
//         orgCode: post.organization.orgCode,
//         orgName: post.organization.orgName
//     }
// }

export function getUserDTO(user: User): UserDTO {
    const userDTO: UserDTO = {
        id: user.id,
        username: user.username,
        name: user.name,
        mobile: user.mobilePhone
    }
    return userDTO
}

export function getEmploymentDTO(employment: EmploymentDetail): EmploymentDTO {
    return {
        id: employment.id,
        posId: employment.position.id,
        posCode: employment.position.posCode,
        posName: employment.position.posName,
        orgId: employment.deptId,
        orgCode: employment.deptartment.orgCode,
        orgName: employment.deptartment.orgName,
        compId: employment.compId,
        compCode: employment.company.orgCode,
        compName: employment.company.orgName
    }
}

