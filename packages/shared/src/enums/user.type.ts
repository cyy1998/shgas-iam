export enum UserType {
  Formal = "正式员工",
  External = "外部用户",
}

export function getUserTypeOptions(): { label: string; value: string }[] {
  return [
    { label: "正式员工", value: UserType.Formal },
    { label: "外部用户", value: UserType.External },
  ];
}
