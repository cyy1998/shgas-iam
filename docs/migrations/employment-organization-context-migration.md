# Employment Organization Context Migration

## Summary

Employment now stores only the actual assignment organization in `employment.dept_id` / `orgId`. Company display and compatibility fields are derived from the assigned organization's `organization_closure` ancestor path.

The migration `20260526090204_lucky_ben_parker` drops `employment.comp_id` and `idx_comp_id`.

## Pre-Migration Audit

Run these checks before applying the drop-column migration in any persistent environment.

```sql
-- Employments whose stored comp_id does not match the nearest Company ancestor.
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

-- Employments whose assigned organization has no Company ancestor.
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

Record and resolve mismatch rows before applying the migration. Rows without a Company ancestor are allowed for supplier, external, individual external, virtual, or temporary organizations; their deprecated `compCode` and `compName` fields return `null`.

## Audit Result On 2026-05-27

Using the configured `packages/db/.env` database, the pre-migration audit found:

- `2078` active employment rows where stored `comp_id` differs from the nearest Company ancestor derived from `dept_id`.
- `1908` active employment rows whose assigned organization has no Company ancestor.

Mismatch samples were concentrated around employments assigned to `org_id=80`, where the stored company was `2` but the nearest derived Company ancestor was `80` / `SB51` / `嘉定分公司`. Example employment ids: `218`, `236`, `1373`, `1374`, `1375`.

No-Company samples were external organizations such as `91310115132249289B` / `上海燃气浦东销售有限公司`, `913101157031458200` / `上海世昕软件股份有限公司`, and `91310230756971042J` / `上海勘察设计研究院（集团）股份有限公司`. These rows are expected to return `compCode=null` and `compName=null` after migration.

## Backup And Rollback

Before applying the migration, take a database backup or at minimum export the current employment company mapping:

```sql
create table if not exists employment_comp_id_backup_20260526 as
select id as employment_id, comp_id, now() as backed_up_at
from employment;
```

Rollback before the drop-column migration is applied by reverting the application deployment. Rollback after the column is dropped requires restoring the column and repopulating it from backup:

```sql
alter table employment add column comp_id integer;
update employment e
set comp_id = b.comp_id
from employment_comp_id_backup_20260526 b
where b.employment_id = e.id;
alter table employment alter column comp_id set not null;
create index idx_comp_id on employment (comp_id);
```

If the backup table is unavailable, `comp_id` can only be reconstructed from the current organization tree, which may not match historical stored values.
