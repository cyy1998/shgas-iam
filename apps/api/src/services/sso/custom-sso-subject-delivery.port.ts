import type {
  ClientSubjectProjection,
  ResolveClientSubjectInput,
} from "@iam/client-subject-projection";

export interface CustomSsoSubjectProjectionPort {
  resolve: (
    input: ResolveClientSubjectInput,
  ) => Promise<ClientSubjectProjection>;
}
