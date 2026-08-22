export enum OrganizationResponsibilityTypeCode {
  Head = "head",
  Supervising = "supervising",
}

export enum OrganizationResponsibilityAssignmentCardinality {
  Single = "single",
  Multiple = "multiple",
}

export enum OrganizationResponsibilityAssignmentStatus {
  Enable = 1,
  Pause,
  Disable,
}

export const ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS = {
  Pause: "pause",
  Resume: "resume",
  End: "end",
} as const;

export type OrganizationResponsibilityAssignmentLifecycleCommand
  = (typeof ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS)[
    keyof typeof ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS
  ];

export const ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG = Object.freeze([
  Object.freeze({
    code: OrganizationResponsibilityTypeCode.Head,
    name: "负责人",
    description: "对目标组织承担负责人责任。",
    assignmentCardinality: OrganizationResponsibilityAssignmentCardinality.Single,
    displayOrder: 10,
  }),
  Object.freeze({
    code: OrganizationResponsibilityTypeCode.Supervising,
    name: "分管领导",
    description: "对目标组织承担分管领导责任。",
    assignmentCardinality: OrganizationResponsibilityAssignmentCardinality.Multiple,
    displayOrder: 20,
  }),
] as const);
