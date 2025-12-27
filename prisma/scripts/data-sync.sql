truncate TABLE iam2.`user`
;
INSERT INTO iam2.`user`
SELECT id, username, name, null, mobile_phone, user_type, status, is_delete, create_time, update_time, wxId
FROM iam.`user`
;
truncate TABLE iam2.organization
;
INSERT INTO iam2.organization
SELECT id, org_code, org_name, parent_id, business_parent_id, `level`, org_type, order_num, is_virtual, is_entity, status, is_delete, create_time, update_time, `path`
FROM iam.organization
;
truncate TABLE iam2.organization_closure
;
INSERT INTO iam2.organization_closure
SELECT id, ancestor_id, descendant_id, `depth`
FROM iam.organization_closure
;
truncate TABLE iam2.`position`
;
INSERT INTO iam2.`position`
SELECT id, post_code, post_name, status, description, is_delete, create_time, update_time
FROM iam.`position`
;
truncate TABLE iam2.employment
;
INSERT INTO iam2.employment
SELECT id, user_id, pos_id, status, description, is_delete, create_time, update_time, comp_id, dept_id, end_time, start_time, is_primary
FROM iam.employment
;
truncate TABLE iam2.pos_org_composition
;
INSERT INTO iam2.pos_org_composition
SELECT id, pos_id, org_id, status, description, is_delete, create_time, update_time
FROM iam.pos_org_composition
;
truncate TABLE iam2.`role`
;
insert INTO iam2.`role`
SELECT id, role_code, role_name, client_id, status, description, is_delete, create_time, update_time
FROM iam.`role`
;
truncate TABLE iam2.organization_role 
;
INSERT INTO iam2.organization_role
SELECT organization_id, role_id, is_all_sub
FROM iam.organization_role
;
truncate TABLE iam2.position_role 
;
INSERT INTO iam2.position_role
SELECT position_id, role_id
FROM iam.position_role
;
TRUNCATE TABLE iam2.employment_role
;
INSERT INTO iam2.employment_role
SELECT employment_id, role_id
FROM iam.employment_role
;
truncate TABLE iam2.position_organization_role 
;
INSERT INTO iam2.position_organization_role
SELECT role_id, pos_org_id
FROM iam.position_organization_role
;
truncate TABLE iam2.privilege
;
INSERT INTO iam2.privilege
SELECT id, privilege_code, privilege_name, field_values, status, description, is_delete, create_time, update_time
FROM iam.privilege
;
TRUNCATE TABLE iam2.role_privilege
;
INSERT INTO iam2.role_privilege 
SELECT role_id, privilege_id
FROM iam.role_privilege
;