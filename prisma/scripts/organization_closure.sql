TRUNCATE TABLE organization_closure RESTART IDENTITY;
CREATE TEMPORARY TABLE temp_org_path AS
WITH RECURSIVE org_path AS (
  -- 锚点：每个组织自身（depth = 0）
  SELECT 
    id AS ancestor_id,
    id AS descendant_id,
    0 AS depth
  FROM organization
  WHERE is_delete = false  -- 只处理未删除的组织
  UNION ALL
  -- 递归：从父级向上扩展
  SELECT 
    o.parent_id AS ancestor_id,
    op.descendant_id,
    op.depth + 1 AS depth
  FROM org_path op
  JOIN organization o 
    ON op.ancestor_id = o.id
  WHERE o.parent_id != -1          -- 假设 -1 表示无父节点
    AND o.is_delete = false        -- 父节点也必须有效
)
-- INSERT IGNORE INTO organization_closure (ancestor_id, descendant_id, depth)
SELECT ancestor_id, descendant_id, depth
FROM org_path;
INSERT IGNORE INTO organization_closure (ancestor_id, descendant_id, depth)
SELECT ancestor_id, descendant_id, depth
FROM temp_org_path;