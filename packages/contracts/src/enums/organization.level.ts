export enum OrganizationLevel {
  One = 1,
  Two,
  Three,
  Four,
  Five,
}

export function getChildOrganizationLevel(parentLevel: OrganizationLevel | null): OrganizationLevel {
  switch (parentLevel) {
    case null:
      return OrganizationLevel.One;
    case OrganizationLevel.One:
      return OrganizationLevel.Two;
    case OrganizationLevel.Two:
      return OrganizationLevel.Three;
    case OrganizationLevel.Three:
      return OrganizationLevel.Four;
    case OrganizationLevel.Four:
      return OrganizationLevel.Five;
    case OrganizationLevel.Five:
      throw new RangeError("组织层级已达到最大值");
    default:
      throw new RangeError(`未知组织层级: ${parentLevel}`);
  }
}
