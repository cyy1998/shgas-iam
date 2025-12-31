import { prisma, type PrismaTransaction } from '../libs/database/prisma'

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
                    notIn: ['虚拟组织', '外部组织']
                },
                level: orgLevel
            }
        })
    },
    async searchOrganizations(orgCode: string, orgLevel: number, tx: PrismaTransaction = prisma) {
        return await tx.organization.findMany({
            where: {
                descendantClosures: {
                    some: {
                        ancestor: {
                            orgCode: orgCode
                        }
                    }
                },
                level: orgLevel
            }
        })
    },
    async getTopFormalOrganizations(tx: PrismaTransaction = prisma) {
        return await tx.organization.findMany({
            where: {
                orgType: {
                    notIn: ['虚拟组织', '外部组织']
                },
                level: 1
            }
        })
    },
    async getOrgByCode(orgCode: string, tx: PrismaTransaction = prisma) {
        return await tx.organization.findFirst({
            where: {
                orgCode: orgCode,
            }
        })
    },
    async getOrgById(id: number, tx: PrismaTransaction = prisma) {
        return await tx.organization.findFirst({
            where: {
                id: id,
            }
        })
    },
    async getOrgByRoleId(roleId: number, tx: PrismaTransaction = prisma) {
        return await tx.organization.findMany({
            include: {
                roles: {
                    where: {
                        roleId: roleId
                    }
                }
            },
            where: {
                roles: {
                    some: {
                        roleId: roleId
                    }
                }
            }
        })
    },
    async getOrgIdsByIds(ids: number[], tx: PrismaTransaction = prisma) {
        return await tx.organization.findMany({
            select: {
                id: true
            }
        })
    },
    async getOrganizationsByParentId(parentId: number, tx: PrismaTransaction = prisma) {
        return await tx.organization.findMany({
            where: {
                parentId: parentId,
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
                }
            }
        })
    },
    async setOrganization(orgCode: string, orgName: string, orgLevel: number, parentId: number, tx: PrismaTransaction = prisma) {
        return await tx.organization.create({
            data: {
                orgCode: orgCode,
                orgName: orgName,
                parentId: parentId,
                level: orgLevel,
                orgType: '外部组织',
                isVirtual: true,
                path: ''
            }
        })
    },
    async updateOrganizationPath(orgId: number, path: string, tx: PrismaTransaction = prisma) {
        return await tx.organization.update({
            where: {
                id: orgId
            },
            data: {
                path: path
            }
        })
    },
    async updateOrganizationClosure(orgId: number, parentId: number, tx: PrismaTransaction = prisma) {
        const closureRelations = [];
        const parentAncestors = await tx.organizationClosure.findMany({
            where: { descendantId: parentId },
            select: { ancestorId: true, depth: true },
        })
        parentAncestors.forEach((rel) => {
            closureRelations.push({
                ancestorId: rel.ancestorId,
                descendantId: orgId,
                depth: rel.depth + 1,
            })
        })
        closureRelations.push({
            ancestorId: orgId,
            descendantId: orgId,
            depth: 0,
        })
        if (closureRelations.length > 0) {
            await tx.organizationClosure.createMany({
                data: closureRelations,
                skipDuplicates: true, // 防止意外重复，虽然主键约束会拦截，但这样更安全
            })
        }

    }
}