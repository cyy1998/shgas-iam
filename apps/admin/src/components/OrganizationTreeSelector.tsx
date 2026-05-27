import {
  getOrganizationSelectorNodes,
  type OrganizationSelectorNode,
} from '@admin/services/organization';
import { OrganizationStatus, type OrganizationType } from '@iam/contracts';
import type { TreeSelectProps } from 'antd';
import { TreeSelect, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';

type TreeNode = NonNullable<TreeSelectProps['treeData']>[number];
const DEFAULT_SELECTABLE_STATUSES = [OrganizationStatus.Enable];

type Props = {
  value?: string;
  onChange?: (value?: string) => void;
  placeholder?: string;
  disabled?: boolean;
  selectableOrgTypes?: OrganizationType[];
  selectableStatuses?: OrganizationStatus[];
};

function toTreeNode(node: OrganizationSelectorNode): TreeNode {
  return {
    title: `${node.orgName} (${node.orgCode})`,
    value: node.orgCode,
    key: node.orgCode,
    isLeaf: node.isLeaf,
    selectable: node.selectable,
  };
}

function mergeChildren(
  nodes: TreeNode[],
  parentOrgCode: string,
  children: TreeNode[],
): TreeNode[] {
  return nodes.map((node) => {
    if (node.value === parentOrgCode) {
      return { ...node, children };
    }
    if (node.children) {
      return {
        ...node,
        children: mergeChildren(
          node.children as TreeNode[],
          parentOrgCode,
          children,
        ),
      };
    }
    return node;
  });
}

export default function OrganizationTreeSelector({
  value,
  onChange,
  placeholder = '请选择组织',
  disabled,
  selectableOrgTypes,
  selectableStatuses,
}: Props) {
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [searchData, setSearchData] = useState<TreeNode[] | null>(null);
  const [loading, setLoading] = useState(false);

  const selectableOrgTypesKey = selectableOrgTypes?.join('|') ?? '';
  const selectableStatusesKey = (
    selectableStatuses ?? DEFAULT_SELECTABLE_STATUSES
  ).join('|');

  const baseQuery = useMemo(
    () => ({
      selectableOrgTypes: selectableOrgTypes
        ? [...selectableOrgTypes]
        : undefined,
      selectableStatuses: [
        ...(selectableStatuses ?? DEFAULT_SELECTABLE_STATUSES),
      ],
    }),
    [selectableOrgTypesKey, selectableStatusesKey],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getOrganizationSelectorNodes({
      ...baseQuery,
      parentOrgCode: null,
      pageSize: 100,
    })
      .then((nodes) => {
        if (!cancelled) setTreeData(nodes.map(toTreeNode));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          message.error(err instanceof Error ? err.message : '加载组织树失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [baseQuery]);

  const loadData: TreeSelectProps['loadData'] = async (node) => {
    const children = await getOrganizationSelectorNodes({
      ...baseQuery,
      parentOrgCode: String(node.value),
      pageSize: 200,
    });
    setTreeData((prev) =>
      mergeChildren(prev, String(node.value), children.map(toTreeNode)),
    );
  };

  const onSearch = async (text: string) => {
    const keyword = text.trim();
    if (!keyword) {
      setSearchData(null);
      return;
    }
    const nodes = await getOrganizationSelectorNodes({
      ...baseQuery,
      text: keyword,
      pageSize: 80,
    });
    setSearchData(nodes.map(toTreeNode));
  };

  return (
    <TreeSelect
      value={value}
      onChange={onChange}
      disabled={disabled}
      loading={loading}
      allowClear
      showSearch
      treeLine
      treeDefaultExpandAll={searchData !== null}
      filterTreeNode={false}
      loadData={loadData}
      onSearch={onSearch}
      treeData={searchData ?? treeData}
      placeholder={placeholder}
      style={{ width: '100%' }}
    />
  );
}
