import type {
  OrganizationChildrenPage,
  OrganizationTreeNode,
} from '@admin/services/organization';
import { getOrganizationStatusOptions } from '@iam/contracts';
import { Badge, Empty, Spin, Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

type Props = {
  loadChildrenPage: (
    parentOrgCode: string | null,
    pageNum: number,
  ) => Promise<OrganizationChildrenPage>;
  selectedKey?: string;
  onSelect: (orgCode: string, node: OrganizationTreeNode) => void;
  /** 递增以触发整树重置（创建/删除后刷新） */
  reloadSeq?: number;
};

type TreeDataNode = DataNode & {
  isLoadMore?: boolean;
  loadMoreParent?: string | null;
  loadMoreNextPage?: number;
  orgCode?: string;
  raw?: OrganizationTreeNode;
};

const statusColorMap = Object.fromEntries(
  getOrganizationStatusOptions().map((o) => [
    o.value,
    o.color === 'success'
      ? 'green'
      : o.color === 'warning'
      ? 'gold'
      : 'default',
  ]),
) as Record<number, 'green' | 'gold' | 'default'>;

function loadMoreKey(parentOrgCode: string | null, nextPage: number): string {
  return `__loadmore__:${parentOrgCode ?? ''}:${nextPage}`;
}

function renderOrgTitle(node: OrganizationTreeNode): ReactNode {
  return (
    <span>
      <Badge color={statusColorMap[node.status] ?? 'default'} /> {node.orgName}
      <span style={{ color: '#999', marginLeft: 6 }}>({node.orgCode})</span>
    </span>
  );
}

function toOrgNode(node: OrganizationTreeNode): TreeDataNode {
  return {
    key: node.orgCode,
    title: renderOrgTitle(node),
    isLeaf: node.isLeaf,
    orgCode: node.orgCode,
    raw: node,
  };
}

function makeLoadMoreNode(
  parentOrgCode: string | null,
  nextPage: number,
  remaining: number,
): TreeDataNode {
  return {
    key: loadMoreKey(parentOrgCode, nextPage),
    title: (
      <span
        style={{ color: '#1677ff' }}
      >{`加载更多（剩余 ${remaining} 条）`}</span>
    ),
    isLeaf: true,
    isLoadMore: true,
    loadMoreParent: parentOrgCode,
    loadMoreNextPage: nextPage,
  };
}

function buildLevel(
  page: OrganizationChildrenPage,
  parentOrgCode: string | null,
): TreeDataNode[] {
  const nodes: TreeDataNode[] = page.result.map(toOrgNode);
  const loadedEnd = (page.pageNum - 1) * page.pageSize + page.result.length;
  const remaining = page.total - loadedEnd;
  if (remaining > 0) {
    nodes.push(makeLoadMoreNode(parentOrgCode, page.pageNum + 1, remaining));
  }
  return nodes;
}

function setNodeChildren(
  tree: TreeDataNode[],
  parentKey: string,
  children: TreeDataNode[],
): TreeDataNode[] {
  return tree.map((n) => {
    if (n.key === parentKey) {
      return { ...n, children };
    }
    if (n.children) {
      return {
        ...n,
        children: setNodeChildren(
          n.children as TreeDataNode[],
          parentKey,
          children,
        ),
      };
    }
    return n;
  });
}

function appendPageAt(
  tree: TreeDataNode[],
  parentOrgCode: string | null,
  page: OrganizationChildrenPage,
): TreeDataNode[] {
  // Root-level append
  if (parentOrgCode === null) {
    const kept = tree.filter((n) => !n.isLoadMore);
    const next: TreeDataNode[] = [...kept, ...page.result.map(toOrgNode)];
    const loadedEnd = (page.pageNum - 1) * page.pageSize + page.result.length;
    const remaining = page.total - loadedEnd;
    if (remaining > 0) {
      next.push(makeLoadMoreNode(null, page.pageNum + 1, remaining));
    }
    return next;
  }
  // Nested append
  return tree.map((n) => {
    if (n.key === parentOrgCode) {
      const existing = (n.children ?? []) as TreeDataNode[];
      const kept = existing.filter((c) => !c.isLoadMore);
      const next: TreeDataNode[] = [...kept, ...page.result.map(toOrgNode)];
      const loadedEnd = (page.pageNum - 1) * page.pageSize + page.result.length;
      const remaining = page.total - loadedEnd;
      if (remaining > 0) {
        next.push(makeLoadMoreNode(parentOrgCode, page.pageNum + 1, remaining));
      }
      return { ...n, children: next };
    }
    if (n.children) {
      return {
        ...n,
        children: appendPageAt(
          n.children as TreeDataNode[],
          parentOrgCode,
          page,
        ),
      };
    }
    return n;
  });
}

export default function OrgTree({
  loadChildrenPage,
  selectedKey,
  onSelect,
  reloadSeq = 0,
}: Props) {
  const [treeData, setTreeData] = useState<TreeDataNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  const reloadRoots = useCallback(async () => {
    setLoading(true);
    try {
      const page = await loadChildrenPage(null, 1);
      setTreeData(buildLevel(page, null));
      setExpandedKeys([]);
    } finally {
      setLoading(false);
    }
  }, [loadChildrenPage]);

  useEffect(() => {
    reloadRoots();
  }, [reloadRoots, reloadSeq]);

  const onLoadData = async (node: TreeDataNode) => {
    if (node.isLoadMore || !node.orgCode) return;
    const page = await loadChildrenPage(node.orgCode, 1);
    setTreeData((prev) =>
      setNodeChildren(prev, node.orgCode!, buildLevel(page, node.orgCode!)),
    );
  };

  const handleLoadMore = async (
    parentOrgCode: string | null,
    nextPage: number,
  ) => {
    const page = await loadChildrenPage(parentOrgCode, nextPage);
    setTreeData((prev) => appendPageAt(prev, parentOrgCode, page));
  };

  if (loading) {
    return <Spin />;
  }

  if (treeData.length === 0) {
    return <Empty description="暂无组织数据" />;
  }

  return (
    <Tree<TreeDataNode>
      blockNode
      showLine
      treeData={treeData}
      selectedKeys={selectedKey ? [selectedKey] : []}
      expandedKeys={expandedKeys}
      loadData={onLoadData}
      onExpand={(keys) => setExpandedKeys(keys as string[])}
      onSelect={(_, info) => {
        const node = info.node as TreeDataNode;
        if (node.isLoadMore) {
          void handleLoadMore(
            node.loadMoreParent ?? null,
            node.loadMoreNextPage!,
          );
          return;
        }
        if (node.orgCode && node.raw) {
          onSelect(node.orgCode, node.raw);
        }
      }}
    />
  );
}
