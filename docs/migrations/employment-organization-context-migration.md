# 任职组织上下文迁移

## 概要

任职现在只在 `employment.dept_id` / `orgId` 中保存实际任职组织。公司展示字段和兼容字段都从任职组织在 `organization_closure` 中的祖先路径派生。

迁移 `20260526090204_lucky_ben_parker` 会删除 `employment.comp_id` 和 `idx_comp_id`。

## 迁移前审计

在任何持久化环境应用删除列迁移前，请先执行以下检查。

```sql
-- 存储的 comp_id 与最近的分公司祖先不匹配的任职。
with company_ancestors as (
  select
    e.id as employment_id,
    e.comp_id as stored_comp_id,
    oc.ancestor_id as derived_comp_id,
    row_number() over (
      partition by e.id
      order by oc.depth asc
    ) as rn
  from employment e
  join organization_closure oc on oc.descendant_id = e.dept_id
  join organization o on o.id = oc.ancestor_id
  where e.is_delete = false
    and o.is_delete = false
    and o.org_type = '分公司'
)
select
  e.id,
  e.user_id,
  e.dept_id,
  e.comp_id,
  ca.derived_comp_id
from employment e
left join company_ancestors ca
  on ca.employment_id = e.id and ca.rn = 1
where e.is_delete = false
  and ca.derived_comp_id is distinct from e.comp_id
order by e.id
limit 100;

-- 任职组织没有分公司祖先的任职。
select
  e.id,
  e.user_id,
  e.dept_id,
  o.org_code,
  o.org_name,
  o.org_type
from employment e
join organization o on o.id = e.dept_id
where e.is_delete = false
  and not exists (
    select 1
    from organization_closure oc
    join organization ancestor on ancestor.id = oc.ancestor_id
    where oc.descendant_id = e.dept_id
      and ancestor.is_delete = false
      and ancestor.org_type = '分公司'
  )
order by e.id
limit 100;
```

应用迁移前，请记录并处理不匹配的行。没有分公司祖先的行允许存在于供应商、外部、个人外部、虚拟或临时组织中；它们废弃的 `compCode` 和 `compName` 字段会返回 `null`。

## 2026-05-27 审计结果

使用 `packages/db/.env` 中配置的数据库执行迁移前审计，结果如下：

- `2078` 条有效任职记录中，已存储的 `comp_id` 与从 `dept_id` 派生出的最近分公司祖先不同。
- `1908` 条有效任职记录的任职组织没有分公司祖先。

不匹配样例集中在分配到 `org_id=80` 的任职附近，其中存储的公司为 `2`，但最近派生出的分公司祖先为 `80` / `SB51` / `嘉定分公司`。示例任职 ID：`218`、`236`、`1373`、`1374`、`1375`。

无分公司样例为外部组织，例如 `91310115132249289B` / `上海燃气浦东销售有限公司`、`913101157031458200` / `上海世昕软件股份有限公司`，以及 `91310230756971042J` / `上海勘察设计研究院（集团）股份有限公司`。这些行在迁移后预期返回 `compCode=null` 和 `compName=null`。

## 备份与回滚

应用迁移前，请先备份数据库，或至少导出当前任职与公司的映射：

```sql
create table if not exists employment_comp_id_backup_20260526 as
select id as employment_id, comp_id, now() as backed_up_at
from employment;
```

在删除列迁移应用前，可以通过回滚应用部署完成回滚。列删除后回滚，需要恢复该列并从备份重新填充：

```sql
alter table employment add column comp_id integer;
update employment e
set comp_id = b.comp_id
from employment_comp_id_backup_20260526 b
where b.employment_id = e.id;
alter table employment alter column comp_id set not null;
create index idx_comp_id on employment (comp_id);
```

如果备份表不可用，`comp_id` 只能从当前组织树重建，这可能与历史存储值不一致。
