export const SubjectClaim = {
  SubjectIdentifier: "subjectIdentifier",
  ProfileUsername: "profile:username",
  ProfileName: "profile:name",
  ProfilePhone: "profile:phone",
  ProfileEmployments: "profile:employments",
  IamAuthorization: "iam:authorization",
} as const;

export type SubjectClaimName = typeof SubjectClaim[keyof typeof SubjectClaim];

export const SUBJECT_CLAIMS = Object.values(SubjectClaim) as [
  SubjectClaimName,
  ...SubjectClaimName[],
];
