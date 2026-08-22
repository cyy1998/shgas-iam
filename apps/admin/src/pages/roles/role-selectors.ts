import { requestEmploymentOptions } from '@admin/components/employment-select-options';
import { type ClientVo, searchClients } from '@admin/services/client';
import { type PositionVo, searchPositions } from '@admin/services/position';
import type { RoleAssignmentCreateInput } from '@admin/services/role';
import { PositionStatus, RoleAssignmentTargetType } from '@iam/contracts';

type SelectRequestParams = {
  keyWords?: string;
};

type ClientOptionSource = Partial<
  Pick<ClientVo, 'clientCode' | 'clientName'>
> & {
  value?: string;
  label?: string;
};

type AssignmentFormValues = Partial<RoleAssignmentCreateInput> & {
  targetType?: RoleAssignmentTargetType;
};

export const roleAssignmentTargetTypeOptions = [
  { label: '组织', value: RoleAssignmentTargetType.Organization },
  { label: '岗位', value: RoleAssignmentTargetType.Position },
  { label: '任职', value: RoleAssignmentTargetType.Employment },
];

function keyword(params: SelectRequestParams) {
  return params.keyWords?.trim() || undefined;
}

function uniqueOptions<T extends { value: string | number }>(options: T[]) {
  const seen = new Set<string | number>();
  return options.filter((option) => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}

export function formatClientOption(client: ClientOptionSource) {
  const clientCode = client.clientCode ?? client.value ?? '';
  const clientName = client.clientName ?? client.label ?? clientCode;
  return {
    label:
      clientName === clientCode ? clientCode : `${clientName}（${clientCode}）`,
    value: clientCode,
  };
}

export function formatPositionOption(position: PositionVo) {
  return {
    label: `${position.posName}（${position.posCode}）`,
    value: position.posCode,
  };
}

export async function requestClientOptions(
  params: SelectRequestParams,
  selectedClient?: ClientOptionSource,
) {
  const text = keyword(params);
  const res = await searchClients({
    pageNum: 1,
    pageSize: 20,
    conditions: {
      fuzzyConditions: text ? { text } : {},
      exactConditions: {},
    },
  });
  return uniqueOptions(
    [
      ...(selectedClient ? [formatClientOption(selectedClient)] : []),
      ...res.result.map(formatClientOption),
    ].filter((option) => option.value !== ''),
  );
}

export async function requestPositionOptions(params: SelectRequestParams) {
  const text = keyword(params);
  const res = await searchPositions({
    pageNum: 1,
    pageSize: 50,
    conditions: {
      fuzzyConditions: text ? { text } : {},
      exactConditions: { statuses: [PositionStatus.Enable] },
    },
  });
  return res.result.map(formatPositionOption);
}

export { requestEmploymentOptions };

export function normalizeAssignmentCreateInput(
  values: AssignmentFormValues,
): RoleAssignmentCreateInput {
  if (values.targetType === RoleAssignmentTargetType.Position) {
    return {
      targetType: RoleAssignmentTargetType.Position,
      posCode: values.posCode,
    };
  }
  if (values.targetType === RoleAssignmentTargetType.Employment) {
    return {
      targetType: RoleAssignmentTargetType.Employment,
      employmentId: values.employmentId,
    };
  }
  return {
    targetType: RoleAssignmentTargetType.Organization,
    orgCode: values.orgCode,
    includeDescendants: values.includeDescendants ?? true,
  };
}
