import type { Organization } from '../../generated/prisma'
import { OrganizationStatus } from '../constants/organization.status'
import { OrganizationType } from '../constants/organization.type'
import { prisma, type PrismaTransaction } from '../libs/database/prisma'
import type { OrganizationQueryDto } from '../types/organization.common.type'

export const organizationRepository = {
    async searchFormalOrganizations(orgCode: string, orgLevel: number, tx: PrismaTransaction = prisma) {
        return await tx.organization.findMany({
            where: {
                descendantClosures: {
                    some: {
                        ancestor: {
                            orgCode: orgCode
                        }
                    }
                },
                orgType: {
                    notIn: [OrganizationType.Virtual, OrganizationType.External]
                },
                level: orgLevel,
                status: OrganizationStatus.Enable,
                isDelete: false
            },
            include: {
                parent: true
            }
        })
    },
    // async searchOrganizations(orgCode: string, orgLevel: number, tx: PrismaTransaction = prisma) {
    //     return await tx.organization.findMany({
    //         where: {
    //             descendantClosures: {
    //                 some: {
    //                     ancestor: {
    //                         orgCode: orgCode
    //                     }
    //                 }
    //             },
    //             level: orgLevel,
    //             status: OrganizationStatus.Enable,
    //             isDelete: false
    //         }
    //     })
    // },
    async getTopFormalOrganizations(tx: PrismaTransaction = prisma) {
        return await tx.organization.findMany({
            where: {
                orgType: {
                    notIn: [OrganizationType.Virtual, OrganizationType.External]
                },
                level: 1,
                status: OrganizationStatus.Enable,
                isDelete: false
            },
            include: {
                parent: true
            }
        })
    },
    async getOrganizationByCode(orgCode: string, tx: PrismaTransaction = prisma) {
        return await tx.organization.findFirst({
            where: {
                orgCode: orgCode,
                status: OrganizationStatus.Enable,
                isDelete: false
            },
            include: {
                parent: true
            }
        })
    },
    async getOrganizationById(id: number, tx: PrismaTransaction = prisma) {
        return await tx.organization.findFirst({
            where: {
                id: id,
                status: OrganizationStatus.Enable,
                isDelete: false
            },
            include: {
                parent: true
            }
        })
    },
    async searchOrganizations(
        organizationQueryDto: OrganizationQueryDto,
        tx: PrismaTransaction = prisma
    ) {
        return await tx.organization.findMany({
            where: {
                descendantClosures: {
                    some: {
                        ancestor: {
                            orgCode: {
                                in: organizationQueryDto.ancestorCodes
                            }
                        },
                        depth: {
                            in: organizationQueryDto.ancestorDepths
                        }
                    }
                },
                ancestorClosures: {
                    some: {
                        descendant: {
                            orgCode: {
                                in: organizationQueryDto.descendantCodes
                            }
                        },
                        depth: {
                            in: organizationQueryDto.descendantDepths
                        }
                    }
                },
                level: {
                    in: organizationQueryDto.orgLevels
                },
                orgType: {
                    in: organizationQueryDto.orgTypes
                },
                orgCode: {
                    in: organizationQueryDto.orgCodes
                },
                status: OrganizationStatus.Enable,
                isDelete: false
            },
            include: {
                parent: true
            }
        })
    },
    // async getOrgByRoleId(roleId: number, tx: PrismaTransaction = prisma) {
    //     return await tx.organization.findMany({
    //         include: {
    //             roles: {
    //                 where: {
    //                     roleId: roleId
    //                 }
    //             }
    //         },
    //         where: {
    //             roles: {
    //                 some: {
    //                     roleId: roleId
    //                 }
    //             }
    //         }
    //     })
    // },
    // async getOrgIdsByIds(ids: number[], tx: PrismaTransaction = prisma) {
    //     return await tx.organization.findMany({
    //         select: {
    //             id: true
    //         }
    //     })
    // },
    async getOrganizationsByParentId(parentId: number, tx: PrismaTransaction = prisma) {
        return await tx.organization.findMany({
            where: {
                parentId: parentId,
                status: OrganizationStatus.Enable,
                isDelete: false
            },
            include: {
                parent: true
            }
        })
    },
    async getOrganizationsByParentsCode(parentCodes: string[], tx: PrismaTransaction = prisma) {
        return await tx.organization.findMany({
            where: {
                parent: {
                    orgCode: {
                        in: parentCodes
                    }
                },
                status: OrganizationStatus.Enable,
                isDelete: false
            },
            include: {
                parent: true
            }
        })
    },
    async setOrganization(orgCode: string, orgName: string,
        orgLevel: number, orgType: string,
        parentOrganization: Organization,
        tx: PrismaTransaction = prisma) {
        const newOrganization = await tx.organization.create({
            data: {
                orgCode: orgCode,
                orgName: orgName,
                parentId: parentOrganization.id,
                level: orgLevel,
                orgType: orgType,
                isVirtual: true,
                path: ''
            }
        })
        const path = `${parentOrganization.path}/${newOrganization.id}`
        const updatedOrganization = await tx.organization.update({
            where: {
                id: newOrganization.id,
                status: OrganizationStatus.Enable,
                isDelete: false
            },
            data: {
                path: path
            }
        })
        const closureRelations = [];
        const parentAncestors = await tx.organizationClosure.findMany({
            where: {
                descendantId: parentOrganization.id
            },
            select: { ancestorId: true, depth: true },
        })
        parentAncestors.forEach((rel) => {
            closureRelations.push({
                ancestorId: rel.ancestorId,
                descendantId: newOrganization.id,
                depth: rel.depth + 1,
            })
        })
        closureRelations.push({
            ancestorId: newOrganization.id,
            descendantId: newOrganization.id,
            depth: 0,
        })
        if (closureRelations.length > 0) {
            await tx.organizationClosure.createMany({
                data: closureRelations,
                skipDuplicates: true, // 防止意外重复，虽然主键约束会拦截，但这样更安全
            })
        }
        return updatedOrganization
    },
    // async updateOrganizationPath(orgId: number, path: string, tx: PrismaTransaction = prisma) {
    //     return await tx.organization.update({
    //         where: {
    //             id: orgId,
    //             status: OrganizationStatus.Enable,
    //             isDelete: false
    //         },
    //         data: {
    //             path: path
    //         }
    //     })
    // },
    // async updateOrganizationClosure(orgId: number, parentId: number, tx: PrismaTransaction = prisma) {
    //     const closureRelations = [];
    //     const parentAncestors = await tx.organizationClosure.findMany({
    //         where: {
    //             descendantId: parentId
    //         },
    //         select: { ancestorId: true, depth: true },
    //     })
    //     parentAncestors.forEach((rel) => {
    //         closureRelations.push({
    //             ancestorId: rel.ancestorId,
    //             descendantId: orgId,
    //             depth: rel.depth + 1,
    //         })
    //     })
    //     closureRelations.push({
    //         ancestorId: orgId,
    //         descendantId: orgId,
    //         depth: 0,
    //     })
    //     if (closureRelations.length > 0) {
    //         await tx.organizationClosure.createMany({
    //             data: closureRelations,
    //             skipDuplicates: true, // 防止意外重复，虽然主键约束会拦截，但这样更安全
    //         })
    //     }

    // }
}