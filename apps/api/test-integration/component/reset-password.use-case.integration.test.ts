import type { AuditLogInput } from "@api/services/audit/audit.context";
import { createImmediateUnitOfWork } from "@api/testing/fakes";
import { createResetPasswordUseCase } from "@api/use-cases/account-recovery/reset-password/reset-password.use-case";
import { expect, mock, test } from "bun:test";

function createDeps() {
  const user = { id: 1, username: "zhangsan", name: "张三", mobile: "17721462865" };
  const reservation = { usage: "resetPassword", phone: "17721462865", token: "reservation-1" };
  const auditLogWriter = { recordAuditLog: mock(async (_input: AuditLogInput) => undefined) };
  const txAuditLogWriter = { recordAuditLog: mock(async (_input: AuditLogInput) => undefined) };
  const userWriter = { setPassword: mock(async () => undefined) };
  const deps = {
    auditLogWriter,
    boundMobileResolver: { resolveBoundMobile: mock(async () => "17721462865") },
    passwordHasher: { hashUserPassword: mock(async () => "hashed:newPass123") },
    userLookup: { getActiveUserByUsername: mock(async () => user) },
    verificationCodes: {
      reserveVerificationCode: mock(async () => reservation),
      confirmReservedVerificationCode: mock(async () => true),
      releaseReservedVerificationCode: mock(async () => undefined),
    },
    uow: createImmediateUnitOfWork({ auditLogWriter: txAuditLogWriter, userWriter }),
  };
  return { auditLogWriter, deps, reservation, txAuditLogWriter, user, userWriter };
}

test("resets the password in a transaction before confirming the verification code", async () => {
  const events: string[] = [];
  const useCase = createResetPasswordUseCase({
    auditLogWriter: { recordAuditLog: async () => undefined },
    boundMobileResolver: {
      resolveBoundMobile: async () => {
        events.push("resolve");
        return "17721462865";
      },
    },
    passwordHasher: {
      hashUserPassword: async () => {
        events.push("hash");
        return "hashed:newPass123";
      },
    },
    userLookup: {
      getActiveUserByUsername: async () => {
        events.push("lookup");
        return { id: 1, username: "zhangsan", name: "张三", mobile: "17721462865" };
      },
    },
    verificationCodes: {
      reserveVerificationCode: async () => {
        events.push("reserve");
        return { usage: "resetPassword", phone: "17721462865", token: "reservation-1" };
      },
      confirmReservedVerificationCode: async () => {
        events.push("confirm");
        return true;
      },
      releaseReservedVerificationCode: async () => {
        events.push("release");
      },
    },
    uow: createImmediateUnitOfWork({
      auditLogWriter: {
        recordAuditLog: async (_input: AuditLogInput) => {
          events.push("tx:audit");
        },
      },
      userWriter: {
        setPassword: async () => {
          events.push("tx:password");
        },
      },
    }),
  });

  const result = await useCase.execute({
    code: "123456",
    newPassword: "newPass123",
    phoneNumber: "177****2865",
    username: "zhangsan",
  });

  expect({ events, result }).toEqual({
    events: ["resolve", "lookup", "reserve", "hash", "tx:password", "tx:audit", "confirm"],
    result: true,
  });
});

test("audits a live mobile mismatch before rejecting Account Recovery", async () => {
  const context = createDeps();
  context.deps.userLookup.getActiveUserByUsername.mockResolvedValue({
    ...context.user,
    mobile: "13800000000",
  });
  const useCase = createResetPasswordUseCase(context.deps);

  await expect(useCase.execute({
    code: "123456",
    newPassword: "newPass123",
    username: "zhangsan",
  })).rejects.toThrow("用户名与手机号不匹配");

  expect(context.auditLogWriter.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
    action: "auth.password.reset",
    outcome: "failure",
    details: expect.objectContaining({ reason: "mobile_mismatch" }),
  }));
  expect(context.deps.verificationCodes.reserveVerificationCode).not.toHaveBeenCalled();
});

test("audits an invalid password-reset code before rejecting Account Recovery", async () => {
  const context = createDeps();
  context.deps.verificationCodes.reserveVerificationCode.mockResolvedValue(null as never);
  const useCase = createResetPasswordUseCase(context.deps);

  await expect(useCase.execute({
    code: "000000",
    newPassword: "newPass123",
    username: "zhangsan",
  })).rejects.toThrow("验证码错误");

  expect(context.auditLogWriter.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
    action: "auth.password.reset",
    outcome: "failure",
    details: expect.objectContaining({ reason: "invalid_verification_code" }),
  }));
  expect(context.userWriter.setPassword).not.toHaveBeenCalled();
});

test("releases the reserved code when the password transaction fails", async () => {
  const context = createDeps();
  context.userWriter.setPassword.mockRejectedValue(new Error("db failed"));
  const useCase = createResetPasswordUseCase(context.deps);

  await expect(useCase.execute({
    code: "123456",
    newPassword: "newPass123",
    username: "zhangsan",
  })).rejects.toThrow("db failed");

  expect(context.deps.verificationCodes.releaseReservedVerificationCode)
    .toHaveBeenCalledWith(context.reservation);
  expect(context.deps.verificationCodes.confirmReservedVerificationCode).not.toHaveBeenCalled();
});

test("does not release the code when confirmation fails after password commit", async () => {
  const context = createDeps();
  context.deps.verificationCodes.confirmReservedVerificationCode.mockRejectedValue(new Error("confirm failed"));
  const useCase = createResetPasswordUseCase(context.deps);

  await expect(useCase.execute({
    code: "123456",
    newPassword: "newPass123",
    username: "zhangsan",
  })).rejects.toThrow("confirm failed");

  expect(context.deps.verificationCodes.releaseReservedVerificationCode).not.toHaveBeenCalled();
});

test("records the existing password-reset success audit inside the transaction", async () => {
  const context = createDeps();
  const useCase = createResetPasswordUseCase(context.deps);

  await useCase.execute({
    code: "123456",
    newPassword: "newPass123",
    username: "zhangsan",
  }, {
    requestContext: {
      sourceApp: "iam",
      requestId: "req-1",
      traceId: null,
      ip: null,
      userAgent: null,
      route: null,
      method: null,
    },
  });

  expect(context.txAuditLogWriter.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
    action: "auth.password.reset",
    outcome: "success",
    requestId: "req-1",
    details: {
      passwordReset: true,
      phoneNumber: "177****2865",
    },
  }));
});

test("rejects when the active user disappears before password reset", async () => {
  const context = createDeps();
  context.deps.userLookup.getActiveUserByUsername.mockResolvedValue(null as never);
  const useCase = createResetPasswordUseCase(context.deps);

  await expect(useCase.execute({
    code: "123456",
    newPassword: "newPass123",
    username: "zhangsan",
  })).rejects.toThrow("用户不存在");

  expect(context.deps.verificationCodes.reserveVerificationCode).not.toHaveBeenCalled();
});
