import type { UserProfileQueryRecord } from "./user-profile-query.port";
import type {
  UserDto,
  UserProfileEmploymentField,
  UserProfileFilterDsl,
  UserProfileUserField,
  UserQueryDto,
} from "./user-profile.schema";
import {
  buildAncestorKey,
  parseUserProfileDetailDocument,
} from "./user-profile.schema";

export function compileLegacyUserQueryToProfileFilter(query: UserQueryDto): UserProfileFilterDsl | undefined {
  const all: UserProfileFilterDsl[] = [];
  addInCondition(all, "user.username", query.usernames);
  addInCondition(all, "user.name", query.names);
  addInCondition(all, "user.mobile", query.phones);
  addInCondition(all, "user.wxId", query.wxIds);

  const employmentAll: UserProfileFilterDsl[] = [];
  addInCondition(employmentAll, "employment.position.code", query.positionCodes);
  addContainsAnyCondition(employmentAll, "employment.roles", query.roleCodes);

  const ancestorCodes = query.ancestorOrgCodes;
  const ancestorDepths = query.ancestorOrgDepths;
  if (ancestorCodes !== undefined && ancestorDepths !== undefined) {
    addContainsAnyCondition(
      employmentAll,
      "employment.org.ancestorKeys",
      ancestorCodes.flatMap(code => ancestorDepths.map(depth => buildAncestorKey(code, depth))),
    );
  }
  else {
    addContainsAnyCondition(employmentAll, "employment.org.ancestorCodes", ancestorCodes);
    addContainsAnyCondition(employmentAll, "employment.org.ancestorDepths", ancestorDepths);
  }

  if (employmentAll.length > 0) {
    all.push({ nested: "employments", where: { all: employmentAll } });
  }

  if (all.length === 0)
    return undefined;

  return all.length === 1 ? all[0]! : { all };
}

export function toUserDtoFromProfile(profile: UserProfileQueryRecord): UserDto {
  const detail = parseUserProfileDetailDocument(profile.detail);
  const { employments: _employments, privileges: _privileges, roles: _roles, ...user } = detail;
  return user;
}

function addInCondition(
  target: UserProfileFilterDsl[],
  field: UserProfileUserField | UserProfileEmploymentField,
  values: string[] | number[] | undefined,
) {
  if (values === undefined)
    return;

  target.push({ field, op: "in", value: values });
}

function addContainsAnyCondition(
  target: UserProfileFilterDsl[],
  field: UserProfileEmploymentField,
  values: string[] | number[] | undefined,
) {
  if (values === undefined)
    return;

  target.push({ field, op: "containsAny", value: values });
}
