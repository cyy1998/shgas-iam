export enum CustomSsoClientMode {
  Gateway = "gateway",
  Independent = "independent",
}

export enum CustomSsoClientState {
  Unconfigured = "unconfigured",
  Disabled = "disabled",
  Enabled = "enabled",
}

export const SubjectClaim = {
  SubjectIdentifier: "subjectIdentifier",
  ProfileUsername: "profile:username",
  ProfileName: "profile:name",
  ProfilePhone: "profile:phone",
  ProfileEmployments: "profile:employments",
  IamAuthorization: "iam:authorization",
} as const;

export type SubjectClaimName = typeof SubjectClaim[keyof typeof SubjectClaim];

export const SUBJECT_CLAIMS_V1 = Object.values(SubjectClaim) as [
  SubjectClaimName,
  ...SubjectClaimName[],
];
