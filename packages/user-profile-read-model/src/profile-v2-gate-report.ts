export interface ProfileV2GateFailure {
  code: string;
  count: number;
  samples: string[];
}

export function createProfileV2GateFailureCollector() {
  const failures = new Map<string, { count: number; samples: string[] }>();
  return {
    add(code: string, userId?: number, count = 1) {
      const failure = failures.get(code) ?? { count: 0, samples: [] };
      failure.count += count;
      const sample = userId === undefined ? undefined : `user:${userId}`;
      if (
        sample !== undefined
        && failure.samples.length < 10
        && !failure.samples.includes(sample)
      ) {
        failure.samples.push(sample);
      }
      failures.set(code, failure);
    },
    report(): ProfileV2GateFailure[] {
      return [...failures].map(([code, failure]) => ({ code, ...failure }));
    },
  };
}

export function collectProfileV2SummaryFailures(
  summary: {
    userCount: number;
    profileCount: number;
    profileSubjectCount: number;
    distinctProfileSubjectCount: number;
    orphanProfileCount: number;
  },
  add: (code: string, userId?: number, count?: number) => void,
) {
  if (summary.profileCount !== summary.userCount) {
    add("profile-count-mismatch", undefined, Math.abs(
      summary.userCount - summary.profileCount,
    ));
  }
  if (summary.profileSubjectCount !== summary.userCount) {
    add("profile-subject-count-mismatch", undefined, Math.abs(
      summary.userCount - summary.profileSubjectCount,
    ));
  }
  if (summary.distinctProfileSubjectCount !== summary.userCount) {
    add("profile-subject-not-unique", undefined, Math.abs(
      summary.userCount - summary.distinctProfileSubjectCount,
    ));
  }
  if (summary.orphanProfileCount > 0)
    add("orphan-profile", undefined, summary.orphanProfileCount);
}
