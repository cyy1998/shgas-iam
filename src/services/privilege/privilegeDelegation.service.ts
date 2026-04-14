import type { PrismaTransaction } from "@/db";
import { Status } from "@/enums/status";
import { prisma } from "@/db";
import { CustomError } from "@/errors/CustomError";
import * as userRepository from "@/services/user/user.repository";
import { PrivilegeDelegationDtoConverterSchema, PrivilegeDelegationDtoSchema } from "./privilege.schema";

export interface PrivilegeDelegationQueryDto {
  delegatorUsername?: string;
  delegateeUsername?: string;
  orgCode?: string;
}

export interface PrivilegeDelegationSetDto {
  delegatorUsername: string;
  delegateeUsername: string;
  orgCode: string;
  privilegeCodes: string[];
  startTime: Date;
  endTime: Date;
  description?: string;
}

export async function queryPrivilegeDelegations(
  query: PrivilegeDelegationQueryDto,
  tx: PrismaTransaction = prisma,
) {
  const where: any = {
    isDelete: false,
  };

  if (query.delegatorUsername) {
    where.delegatorUser = {
      username: query.delegatorUsername,
    };
  }

  if (query.delegateeUsername) {
    where.delegateeUser = {
      username: query.delegateeUsername,
    };
  }

  if (query.orgCode) {
    where.organizationScope = {
      orgCode: query.orgCode,
    };
  }

  const delegations = await tx.privilegeDelegation.findMany({
    where,
    include: {
      delegatorUser: true,
      delegateeUser: true,
    },
    orderBy: {
      createTime: "desc",
    },
  });

  return delegations.map((d) => PrivilegeDelegationDtoConverterSchema.parse(d));
}

export async function setPrivilegeDelegation(
  dto: PrivilegeDelegationSetDto,
  tx: PrismaTransaction = prisma,
) {
  const delegator = await userRepository.getUserByUsername(dto.delegatorUsername, tx);
  if (!delegator) {
    throw new CustomError(`委托人不存在: ${dto.delegatorUsername}`);
  }

  const delegatee = await userRepository.getUserByUsername(dto.delegateeUsername, tx);
  if (!delegatee) {
    throw new CustomError(`受托人不存在: ${dto.delegateeUsername}`);
  }

  const organization = await tx.organization.findFirst({
    where: {
      orgCode: dto.orgCode,
      status: Status.Enable,
      isDelete: false,
    },
  });
  if (!organization) {
    throw new CustomError(`组织不存在: ${dto.orgCode}`);
  }

  const privileges = await tx.privilege.findMany({
    where: {
      privilegeCode: {
        in: dto.privilegeCodes,
      },
      status: Status.Enable,
      isDelete: false,
    },
  });
  if (privileges.length !== dto.privilegeCodes.length) {
    const foundCodes = privileges.map((p) => p.privilegeCode);
    const notFound = dto.privilegeCodes.filter((c) => !foundCodes.includes(c));
    throw new CustomError(`权限不存在: ${notFound.join(", ")}`);
  }

  const delegation = await tx.privilegeDelegation.create({
    data: {
      delegatorUserId: delegator.id,
      delegateeUserId: delegatee.id,
      organizationScopeId: organization.id,
      startTime: dto.startTime,
      endTime: dto.endTime,
      status: Status.Enable,
      description: dto.description,
      delegationDetails: {
        create: privileges.map((p) => ({
          privilegeId: p.id,
        })),
      },
    },
    include: {
      delegatorUser: true,
      delegateeUser: true,
    },
  });

  return PrivilegeDelegationDtoConverterSchema.parse(delegation);
}
