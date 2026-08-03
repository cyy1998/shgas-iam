import type {
  SubjectAccessBeginReceipt,
  SubjectAccessTransition,
  SubjectAccessTransitionTarget,
} from "./model";
import { RETRYABLE_SERVICE_UNAVAILABLE } from "@iam/contracts";

export class SubjectAccessDisabledError extends Error {
  constructor() {
    super("Subject access is disabled");
    this.name = "SubjectAccessDisabledError";
  }
}

export class SubjectAccessUnavailableError extends Error {
  readonly retryability = RETRYABLE_SERVICE_UNAVAILABLE;

  constructor(cause?: unknown) {
    super("Subject access is unavailable");
    this.name = "SubjectAccessUnavailableError";
    this.cause = cause;
  }
}

export class SubjectAccessTransitionRejectedError extends Error {
  constructor() {
    super("Subject access transition was rejected");
    this.name = "SubjectAccessTransitionRejectedError";
  }
}

export class SubjectAccessWriteUnavailableError extends Error {
  constructor() {
    super("Subject access write is unavailable");
    this.name = "SubjectAccessWriteUnavailableError";
  }
}

export class SubjectAccessBeginPendingError extends SubjectAccessWriteUnavailableError {
  readonly receipt: SubjectAccessBeginReceipt;

  constructor(receipt: SubjectAccessBeginReceipt) {
    super();
    this.name = "SubjectAccessBeginPendingError";
    this.receipt = receipt;
  }
}

export class SubjectAccessRollbackPendingError extends Error {
  readonly receipt: SubjectAccessTransition;

  constructor(receipt: SubjectAccessTransition) {
    super("Subject access rollback confirmation is pending");
    this.name = "SubjectAccessRollbackPendingError";
    this.receipt = receipt;
  }
}

export class SubjectAccessCommitPendingError extends Error {
  readonly receipt: SubjectAccessTransition;
  readonly targetState: SubjectAccessTransitionTarget;

  constructor(
    receipt: SubjectAccessTransition,
    targetState: SubjectAccessTransitionTarget,
  ) {
    super("Subject access commit confirmation is pending");
    this.name = "SubjectAccessCommitPendingError";
    this.receipt = receipt;
    this.targetState = targetState;
  }
}
