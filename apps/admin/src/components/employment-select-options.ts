import {
  type EmploymentVo,
  searchEmployments,
} from '@admin/services/employment';
import { EmploymentStatus } from '@iam/contracts';

type SelectRequestParams = {
  keyWords?: string;
};

type EmploymentOption = {
  label: string;
  value: number;
};

type EmploymentOptionFormatter = (employment: EmploymentVo) => EmploymentOption;

function formatEmploymentOrgPath(employment: EmploymentVo) {
  return (
    employment.organization.fullOrgPath
      ?.map((node) => node.orgName)
      .join(' / ') || employment.organization.assignedOrg.orgName
  );
}

export function formatEmploymentOption(employment: EmploymentVo) {
  return {
    label: `${employment.user.name}（${employment.user.username}） / ${formatEmploymentOrgPath(
      employment,
    )} / ${employment.position.posName}（${
      employment.position.posCode
    }） / #${employment.id}`,
    value: employment.id,
  };
}

export function formatEmploymentOptionWithoutId(employment: EmploymentVo) {
  return {
    label: `${employment.user.name}（${employment.user.username}） / ${formatEmploymentOrgPath(
      employment,
    )} / ${employment.position.posName}（${employment.position.posCode}）`,
    value: employment.id,
  };
}

async function requestEmploymentOptionsWithFormatter(
  params: SelectRequestParams,
  formatter: EmploymentOptionFormatter,
) {
  const text = params.keyWords?.trim();
  if (!text) return [];
  const res = await searchEmployments({
    pageNum: 1,
    pageSize: 20,
    conditions: {
      fuzzyConditions: { text },
      exactConditions: { statuses: [EmploymentStatus.Enable] },
    },
  });
  return res.result.map(formatter);
}

export function requestEmploymentOptions(params: SelectRequestParams) {
  return requestEmploymentOptionsWithFormatter(params, formatEmploymentOption);
}

export function requestEmploymentOptionsWithoutId(params: SelectRequestParams) {
  return requestEmploymentOptionsWithFormatter(
    params,
    formatEmploymentOptionWithoutId,
  );
}
