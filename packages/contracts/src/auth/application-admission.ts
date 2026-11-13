export interface ApplicationAdmissionInput {
  clientCode: string;
  subjectIdentifier: string;
  filter: unknown;
}

export type ApplicationAdmissionResult = "match" | "no-match" | "unavailable";
