import {
  getClientStatusOptions,
  getEmploymentStatusOptions,
  getOrganizationStatusOptions,
  getPositionStatusOptions,
  getUserStatusOptions,
} from '@iam/contracts';
import { Tag } from 'antd';

type Domain = 'user' | 'org' | 'position' | 'employment' | 'client';

const optionsByDomain = {
  user: getUserStatusOptions,
  org: getOrganizationStatusOptions,
  position: getPositionStatusOptions,
  employment: getEmploymentStatusOptions,
  client: getClientStatusOptions,
} as const;

type Props = {
  domain: Domain;
  status: number | undefined | null;
};

export default function StatusTag({ domain, status }: Props) {
  if (status === undefined || status === null) {
    return <Tag>未知</Tag>;
  }
  const option = optionsByDomain[domain]().find((o) => o.value === status);
  if (!option) {
    return <Tag>未知({status})</Tag>;
  }
  return <Tag color={option.color}>{option.label}</Tag>;
}
