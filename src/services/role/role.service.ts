import { CustomError } from "@errors/CustomError";
import { employmentRepository } from "@repositories/employment.common.repository";
import { positionRepository } from "@repositories/position.common.repository";
import { posorgRepository } from "@repositories/posorg.repository";
import { privilegeRepository } from "@repositories/privilege.repository";
import { roleRepository } from "@repositories/role.repository";
import { mergeAndDedupe } from "@utils/common.utils";
import { prisma } from "@/db";
import { Prisma } from "@/db/generated/prisma/client";
import { organizationRepository } from "@/services/organization/organization.repository";
import { RoleDtoSchema } from "./role.schema";

export async function getRolesByOrganization(orgId: number) {
  const org = await organizationRepository.getOrganizationById(orgId);
  if (org === null) {
    return [];
  }
  const ancestorIds = org.path.split("/").filter(Boolean).map(Number);
  ancestorIds.pop();
  const rolesAncestor = (await roleRepository.getRolesByAncestorOrgs(ancestorIds)).map(r => RoleDtoSchema.parse(r));
  const rolesDirect = (await roleRepository.getRolesByDirectOrg(org.id)).map(r => RoleDtoSchema.parse(r));
  return mergeAndDedupe(rolesAncestor, rolesDirect, "id");
}
export async function getRolesByPosition(posId: number) {
  const roles = (await roleRepository.getRolesByPosition(posId)).map(r => RoleDtoSchema.parse(r));
  return roles;
}
export async function getRolesByOrgPosition(posId: number, orgId: number) {
  const posOrg = await posorgRepository.getPosOrgById(posId, orgId);
  if (posOrg === null) {
    return [];
  }
  const roles = (await roleRepository.getRolesByPosOrg(posOrg.id)).map(r => RoleDtoSchema.parse(r));
  return roles;
}
export async function getRolesByEmployment(employmentId: number) {
  const roles = (await roleRepository.getRolesByEmployment(employmentId)).map(r => RoleDtoSchema.parse(r));
  return roles;
}
export async function getRolesByUserId(userId: number) {
  const roles = (await roleRepository.getRolesByUserId(userId)).map(r => RoleDtoSchema.parse(r));
  return roles;
}
export async function setRole(roleCode: string, roleName: string) {
  return await prisma.$transaction(async (tx) => {
    const existingRole = await roleRepository.getRoleByCode(roleCode, tx);
    if (existingRole !== null) {
      throw new CustomError("重复角色code代码");
    }
    await roleRepository.setRole(roleCode, roleName, tx);
    return true;
  });
}
export async function setRolePrivilege(roleCode: string, privCode: string) {
  return await prisma.$transaction(async (tx) => {
    const [role, priv] = await Promise.all([
      roleRepository.getRoleByCode(roleCode, tx),
      privilegeRepository.getPrivilegeByCode(privCode, tx),
    ]);
    if (role === null || priv === null) {
      throw new CustomError(`对应实体不存在`);
    }
    try {
      await roleRepository.setRolePrivilege(role.id, priv.id, tx);
    }
    catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new CustomError("对应关系已存在");
      }
      else {
        throw err;
      }
    }
    return true;
  });
}
export async function setRoleForEmployment(username: string, posCode: string, orgCode: string, roleCode: string) {
  return await prisma.$transaction(async (tx) => {
    const [employment, role] = await Promise.all([
      employmentRepository.getEmploymentByUserOrgPosCode(username, orgCode, posCode, tx),
      roleRepository.getRoleByCode(roleCode, tx),
    ]);
    if (employment === null || role === null) {
      throw new CustomError("对应实体不存在");
    }
    try {
      await roleRepository.setRoleForEmployment(role.id, employment.id, tx);
    }
    catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new CustomError("对应关系已存在");
      }
      else {
        throw err;
      }
    }
    return true;
  });
}
export async function setRoleForOrganization(orgCode: string, roleCode: string) {
  return await prisma.$transaction(async (tx) => {
    const [org, role] = await Promise.all([
      organizationRepository.getOrganizationByCode(orgCode, tx),
      roleRepository.getRoleByCode(roleCode, tx),
    ]);
    if (org === null || role === null) {
      throw new CustomError(`对应实体不存在`);
    }
    try {
      await roleRepository.setRoleForOrganization(role.id, org.id, tx);
    }
    catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new CustomError("对应关系已存在");
      }
      else {
        throw err;
      }
    }
    return true;
  });
}
export async function setRoleForPosition(posCode: string, roleCode: string) {
  return await prisma.$transaction(async (tx) => {
    const [pos, role] = await Promise.all([
      positionRepository.getPositionByCode(posCode, tx),
      roleRepository.getRoleByCode(roleCode, tx),
    ]);
    if (pos === null || role === null) {
      throw new CustomError(`对应实体不存在`);
    }
    try {
      await roleRepository.setRoleForPosition(role.id, pos.id, tx);
    }
    catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new CustomError("对应关系已存在");
      }
      else {
        throw err;
      }
    }
    return true;
  });
}
export async function setRoleForPosOrg(orgCode: string, posCode: string, roleCode: string) {
  return await prisma.$transaction(async (tx) => {
    const [role, org, pos] = await Promise.all([
      roleRepository.getRoleByCode(roleCode, tx),
      organizationRepository.getOrganizationByCode(orgCode, tx),
      positionRepository.getPositionByCode(posCode, tx),
    ]);
    if (org === null || role === null || pos === null) {
      throw new CustomError(`对应实体不存在`);
    }
    let posOrg = await posorgRepository.getPosOrgById(pos.id, org.id, tx);
    if (posOrg === null) {
      posOrg = await posorgRepository.setPosOrg(pos.id, org.id, tx);
    }
    try {
      await roleRepository.setRoleForPosOrg(role.id, posOrg.id, tx);
    }
    catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new CustomError("对应关系已存在");
      }
      else {
        throw err;
      }
    }
    return true;
  });
}
export async function deleteRoleForPosOrg(orgCode: string, posCode: string, roleCode: string) {
  return await prisma.$transaction(async (tx) => {
    const [role, org, pos] = await Promise.all([
      roleRepository.getRoleByCode(roleCode, tx),
      organizationRepository.getOrganizationByCode(orgCode, tx),
      positionRepository.getPositionByCode(posCode, tx),
    ]);
    if (org === null || role === null || pos === null) {
      throw new CustomError("对应实体不存在");
    }
    const posOrg = await posorgRepository.getPosOrgById(pos.id, org.id, tx);
    if (posOrg === null) {
      throw new CustomError(`对应实体不存在: ${orgCode}, ${posCode}`);
    }
    await roleRepository.deleteRoleForPosOrg(role.id, posOrg.id, tx);
    return true;
  });
}
export async function deleteRoleForEmployment(username: string, posCode: string, orgCode: string, roleCode: string) {
  return await prisma.$transaction(async (tx) => {
    const [employment, role] = await Promise.all([
      employmentRepository.getEmploymentByUserOrgPosCode(username, orgCode, posCode, tx),
      roleRepository.getRoleByCode(roleCode, tx),
    ]);
    if (employment === null || role === null) {
      throw new CustomError("对应实体不存在");
    }
    await roleRepository.deleteRoleForEmployment(role.id, employment.id, tx);
    return true;
  });
}
