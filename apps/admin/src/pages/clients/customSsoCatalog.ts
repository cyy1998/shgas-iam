import { SUBJECT_CLAIM_CATALOG } from '@iam/client-subject-projection';
import { type SubjectClaimName, SubjectClaim } from '@iam/contracts';

const claimDisplayText: Record<
  SubjectClaimName,
  { label: string; description: string }
> = {
  [SubjectClaim.SubjectIdentifier]: {
    label: 'Subject Identifier',
    description: '协议中性的稳定 opaque 用户标识，始终返回。',
  },
  [SubjectClaim.ProfileUsername]: {
    label: '用户名',
    description: '返回 profile.username。',
  },
  [SubjectClaim.ProfileName]: {
    label: '姓名',
    description: '返回 profile.name。',
  },
  [SubjectClaim.ProfilePhone]: {
    label: '手机号',
    description: '存在时返回 profile.phone。',
  },
  [SubjectClaim.ProfileEmployments]: {
    label: '有效任职',
    description: '没有有效任职时仍返回空数组。',
  },
  [SubjectClaim.IamAuthorization]: {
    label: '当前应用授权',
    description: '没有当前应用授权时仍保留任职、角色和权限空数组。',
  },
};

export const CUSTOM_SSO_CLAIM_CATALOG = SUBJECT_CLAIM_CATALOG.claims.map(
  (entry) => ({
    ...entry,
    ...claimDisplayText[entry.claim],
  }),
);

export { buildCustomSsoPlaceholderPreview } from '@iam/client-subject-projection/custom-sso';
