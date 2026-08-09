import {
  getOrganizationSelectorNodes,
  type OrganizationSelectorNode,
} from '@admin/services/organization';
import { OrganizationStatus, type OrganizationType } from '@iam/contracts';
import type { TreeSelectProps } from 'antd';
import { TreeSelect, message } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { filterOrganizationSelectorNodesByStatus } from './organizationTreeSelector.helpers';

type TreeNode = NonNullable<TreeSelectProps['treeData']>[number];
const DEFAULT_SELECTABLE_STATUSES = [OrganizationStatus.Enable];

function parseOrganizationStatusesKey(key: string): OrganizationStatus[] {
  return key
    ? key.split('|').map((status) => Number(status) as OrganizationStatus)
    : [];
}

function parseOrganizationTypesKey(
  key: string | null,
): OrganizationType[] | undefined {
  if (key === null) return undefined;
  return key ? (key.split('|') as OrganizationType[]) : [];
}

type Props = {
  value?: string;
  onChange?: (value?: string) => void;
  placeholder?: string;
  disabled?: boolean;
  visibleStatuses?: OrganizationStatus[];
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

function findTreeNode(nodes: TreeNode[], value: string): TreeNode | null {
  for (const node of nodes) {
    if (node.value === value) return node;
    if (node.children) {
      const child = findTreeNode(node.children as TreeNode[], value);
      if (child) return child;
    }
  }
  return null;
}

function preserveLoadedChildren(
  nextNodes: TreeNode[],
  previousNodes: TreeNode[],
): TreeNode[] {
  const previousNodeMap = new Map(
    previousNodes.map((node) => [node.value, node]),
  );

  return nextNodes.map((node) => {
    const previousNode = previousNodeMap.get(node.value);
    return previousNode?.children
      ? { ...node, children: previousNode.children }
      : node;
  });
}

function replaceTreeNode(
  nodes: TreeNode[],
  nextNode: TreeNode,
): { nodes: TreeNode[]; replaced: boolean } {
  let replaced = false;
  const nextNodes = nodes.map((node) => {
    if (node.value === nextNode.value) {
      replaced = true;
      return { ...nextNode, children: node.children };
    }
    if (node.children) {
      const result = replaceTreeNode(node.children as TreeNode[], nextNode);
      if (result.replaced) {
        replaced = true;
        return { ...node, children: result.nodes };
      }
    }
    return node;
  });

  return { nodes: nextNodes, replaced };
}

function upsertTreeNode(nodes: TreeNode[], nextNode: TreeNode): TreeNode[] {
  const result = replaceTreeNode(nodes, nextNode);
  return result.replaced ? result.nodes : [nextNode, ...nodes];
}

export default function OrganizationTreeSelector({
  value,
  onChange,
  placeholder = '请选择组织',
  disabled,
  visibleStatuses,
  selectableOrgTypes,
  selectableStatuses,
}: Props) {
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [searchData, setSearchData] = useState<TreeNode[] | null>(null);
  const [loadedBaseQuery, setLoadedBaseQuery] = useState<object | null>(null);
  const valueRef = useRef(value);

  const visibleStatusesKey = (
    visibleStatuses ?? DEFAULT_SELECTABLE_STATUSES
  ).join('|');
  const selectableOrgTypesKey = selectableOrgTypes?.join('|') ?? null;
  const selectableStatusesKey = (
    selectableStatuses ?? DEFAULT_SELECTABLE_STATUSES
  ).join('|');

  const baseQuery = useMemo(
    () => ({
      visibleStatuses: parseOrganizationStatusesKey(visibleStatusesKey),
      selectableOrgTypes: parseOrganizationTypesKey(selectableOrgTypesKey),
      selectableStatuses: parseOrganizationStatusesKey(selectableStatusesKey),
    }),
    [selectableOrgTypesKey, selectableStatusesKey, visibleStatusesKey],
  );
  const currentVisibleStatuses = baseQuery.visibleStatuses;
  const loading = loadedBaseQuery !== baseQuery;

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    getOrganizationSelectorNodes({
      ...baseQuery,
      parentOrgCode: null,
      pageSize: 100,
    })
      .then((nodes) => {
        if (!cancelled) {
          const rootNodes = filterOrganizationSelectorNodesByStatus(
            nodes,
            currentVisibleStatuses,
          ).map(toTreeNode);
          setTreeData((prev) => {
            const nextNodes = preserveLoadedChildren(rootNodes, prev);
            const selectedNode = valueRef.current
              ? findTreeNode(prev, valueRef.current)
              : null;
            return selectedNode
              ? upsertTreeNode(nextNodes, selectedNode)
              : nextNodes;
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          message.error(err instanceof Error ? err.message : '加载组织树失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadedBaseQuery(baseQuery);
      });
    return () => {
      cancelled = true;
    };
  }, [baseQuery, currentVisibleStatuses]);

  useEffect(() => {
    if (!value) return;

    let cancelled = false;
    getOrganizationSelectorNodes({
      ...baseQuery,
      orgCode: value,
      pageSize: 1,
    })
      .then((nodes) => {
        if (cancelled || nodes.length === 0) return;
        const [node] = filterOrganizationSelectorNodesByStatus(
          nodes,
          currentVisibleStatuses,
        );
        if (!node) return;
        const selectedNode = toTreeNode(node);
        setTreeData((prev) => upsertTreeNode(prev, selectedNode));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          message.error(err instanceof Error ? err.message : '加载组织失败');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [baseQuery, currentVisibleStatuses, value]);

  const loadData: TreeSelectProps['loadData'] = async (node) => {
    const children = await getOrganizationSelectorNodes({
      ...baseQuery,
      parentOrgCode: String(node.value),
      pageSize: 200,
    });
    setTreeData((prev) =>
      mergeChildren(
        prev,
        String(node.value),
        filterOrganizationSelectorNodesByStatus(
          children,
          currentVisibleStatuses,
        ).map(toTreeNode),
      ),
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
    setSearchData(
      filterOrganizationSelectorNodesByStatus(
        nodes,
        currentVisibleStatuses,
      ).map(toTreeNode),
    );
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
