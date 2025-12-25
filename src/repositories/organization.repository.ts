import { prisma } from "../extensions"

export const organizationRepository = {
    async searchFormalOrganizations(orgCode: string, orgLevel: number) {
        return await prisma.organization.findMany({
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
    async searchOrganizations(orgCode: string, orgLevel: number) {
        return await prisma.organization.findMany({
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
    async getOrgByCode(orgCode: string) {
        return await prisma.organization.findFirst({
            where: {
                orgCode: orgCode,
            }
        })
    },
    async getOrgById(id: number) {
        return await prisma.organization.findFirst({
            where: {
                id: id,
            }
        })
    },
    async getOrgByRoleId(roleId: number) {
        return await prisma.organization.findMany({
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
    async getOrgIdsByIds(ids: number[]) {
        return await prisma.organization.findMany({
            select: {
                id: true
            }
        })
    },
    async getOrganizationByParent(parentId: number) {
        return await prisma.organization.findMany({
            where: {
                parentId: parentId,
            }
        })
    },
    async setOrganization(orgCode: string, orgName: string, orgLevel: number, parentId: number, path: string) {
        return await prisma.organization.create({
            data: {
                orgCode: orgCode,
                orgName: orgName,
                parentId: parentId,
                level: orgLevel,
                orgType: '外部组织',
                isVirtual: true,
                path: path
            }
        })
    },
    async updateOrganizationPath(orgId: number, path: string) {
        return await prisma.organization.update({
            where: {
                id: orgId
            },
            data: {
                path: path
            }
        })
    }
}