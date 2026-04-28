import { CustomError } from "@/errors/CustomError";
import { prisma } from "@/db";
import * as privilegeRepository from "@/services/privilege/privilege.repository";
import { PrivilegeDtoSchema } from "./privilege.schema";

export async function getPrivilegesByRoleIds(roleIds: number[]) {
  const privileges = (await privilegeRepository.getPrivilegesByRoleIds(roleIds)).map(p => PrivilegeDtoSchema.parse(p));
  return privileges;
}
export async function setPrivilege(privCode: string, privName: string) {
  return await prisma.$transaction(async (tx) => {
    const existingPriv = await privilegeRepository.getPrivilegeByCode(privCode, tx);
    if (existingPriv !== null) {
      throw new CustomError("重复权限code代码");
    }
    await privilegeRepository.setPrivilege(privCode, privName, tx);
    return true;
  });
}
