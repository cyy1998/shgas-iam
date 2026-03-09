import type { PrismaTransaction } from '@/db';
import type { OrganizationQueryDto } from '@schemas/organization.common.type';
import type { Organization } from '@/db/generated/prisma/client';
import { prisma } from '@/db';
import { OrganizationType } from '@enums/organization.type';
import { Status } from '@enums/status';

export const organizationRepository = {
  async searchFormalOrganizations(orgCode: string, orgLevel: number, tx: PrismaTransaction = prisma) {
    return await tx.organization.findMany({
      where: {
        descendantClosures: {
          some: {
            ancestor: {
              orgCode,
            },
          },
        },
        orgType: {
          notIn: [OrganizationType.Virtual, OrganizationType.External],
        },
        level: orgLevel,
        status: Status.Enable,
        isDelete: false,
      },
      include: {
        parent: true,
        children: true,
      },
    });
  },
  async getTopFormalOrganizations(tx: PrismaTransaction = prisma) {
    return await tx.organization.findMany({
      where: {
        orgType: {
          notIn: [OrganizationType.Virtual, OrganizationType.External],
        },
        level: 1,
        status: Status.Enable,
        isDelete: false,
      },
      include: {
        parent: true,
        children: true,
      },
    });
  },
  async getOrganizationByCode(orgCode: string, tx: PrismaTransaction = prisma) {
    return await tx.organization.findFirst({
      where: {
        orgCode,
        status: Status.Enable,
        isDelete: false,
      },
      include: {
        parent: true,
        children: true,
      },
    });
  },
  async getOrganizationById(id: number, tx: PrismaTransaction = prisma) {
    return await tx.organization.findFirst({
      where: {
        id,
        status: Status.Enable,
        isDelete: false,
      },
      include: {
        parent: true,
        children: true,
      },
    });
  },
  async searchOrganizations(
    organizationQueryDto: OrganizationQueryDto,
    tx: PrismaTransaction = prisma,
  ) {
    return await tx.organization.findMany({
      where: {
        descendantClosures: {
          some: {
            ancestor: {
              orgCode: {
                in: organizationQueryDto.ancestorCodes,
              },
            },
            depth: {
              in: organizationQueryDto.ancestorDepths,
            },
          },
        },
        ancestorClosures: {
          some: {
            descendant: {
              orgCode: {
                in: organizationQueryDto.descendantCodes,
              },
            },
            depth: {
              in: organizationQueryDto.descendantDepths,
            },
          },
        },
        level: {
          in: organizationQueryDto.orgLevels,
        },
        orgType: {
          in: organizationQueryDto.orgTypes,
        },
        orgCode: {
          in: organizationQueryDto.orgCodes,
        },
        status: Status.Enable,
        isDelete: false,
      },
      include: {
        parent: true,
        children: true,
      },
    });
  },
  async getOrganizationsByParentId(parentId: number, tx: PrismaTransaction = prisma) {
    return await tx.organization.findMany({
      where: {
        parentId,
        status: Status.Enable,
        isDelete: false,
      },
      include: {
        parent: true,
        children: true,
      },
    });
  },
  async getOrganizationsByParentsCode(parentCodes: string[], tx: PrismaTransaction = prisma) {
    return await tx.organization.findMany({
      where: {
        parent: {
          orgCode: {
            in: parentCodes,
          },
        },
        status: Status.Enable,
        isDelete: false,
      },
      include: {
        parent: true,
        children: true,
      },
    });
  },
  async setOrganization(orgCode: string, orgName: string, orgLevel: number, orgType: string, parentOrganization: Organization, tx: PrismaTransaction = prisma) {
    const newOrganization = await tx.organization.create({
      data: {
        orgCode,
        orgName,
        parentId: parentOrganization.id,
        level: orgLevel,
        orgType,
        isVirtual: true,
        path: '',
      },
    });
    const path = `${parentOrganization.path}/${newOrganization.id}`;
    const updatedOrganization = await tx.organization.update({
      where: {
        id: newOrganization.id,
        status: Status.Enable,
        isDelete: false,
      },
      data: {
        path,
      },
    });
    const closureRelations = [];
    const parentAncestors = await tx.organizationClosure.findMany({
      where: {
        descendantId: parentOrganization.id,
      },
      select: { ancestorId: true, depth: true },
    });
    parentAncestors.forEach((rel) => {
      closureRelations.push({
        ancestorId: rel.ancestorId,
        descendantId: newOrganization.id,
        depth: rel.depth + 1,
      });
    });
    closureRelations.push({
      ancestorId: newOrganization.id,
      descendantId: newOrganization.id,
      depth: 0,
    });
    if (closureRelations.length > 0) {
      await tx.organizationClosure.createMany({
        data: closureRelations,
        skipDuplicates: true, // 防止意外重复，虽然主键约束会拦截，但这样更安全
      });
    }
    return updatedOrganization;
  },
};
