import { expect, mock, test } from "bun:test";
import { createWechatClient } from "../wechat.client";

function createIdentityClient(response: unknown) {
  const fetchFn = mock(async () => Response.json(response));
  const client = createWechatClient({
    config: { corpId: "issuing-corp", corpSecret: "test-secret" },
    redis: { get: async () => "cached", set: mock() },
    fetch: Object.assign(fetchFn, { preconnect() {} }),
  });
  return { client, fetchFn };
}

test("the same provider exchange supports a QR OpenID without expanding the legacy member lookup", async () => {
  const { client, fetchFn } = createIdentityClient({
    errcode: 0,
    openid: "Case-Sensitive-OpenId",
    corpId: "ignored-provider-property",
  });
  const [qr, legacy] = await Promise.allSettled([
    client.getQrIdentity("new-qr-code"),
    client.getWxUserId("legacy-code"),
  ]);
  expect(qr).toEqual({
    status: "fulfilled",
    value: { kind: "external", corpId: "issuing-corp", openId: "Case-Sensitive-OpenId" },
  });
  expect(legacy).toMatchObject({ status: "rejected", reason: { message: "WeChat member identity unavailable" } });
  expect(fetchFn).toHaveBeenCalledTimes(2);
});

test("a verified member ID takes priority over any external ID in the response", async () => {
  const { client } = createIdentityClient({ errcode: 0, userid: " Member-ID ", openid: "unexpected" });
  expect(await client.getQrIdentity("code")).toEqual({ kind: "member", wxId: "Member-ID" });
  expect(await client.getWxUserId("code")).toBe("Member-ID");
});

test.each([
  { errcode: 40029, openid: "will-not-authenticate" },
  { errcode: 0, openid: "雪".repeat(22) },
  { errcode: 0, userid: "", openid: "ambiguous" },
])("QR rejects invalid provider identity data %#", async (response) => {
  const { client } = createIdentityClient(response);
  const [identity] = await Promise.allSettled([client.getQrIdentity("code")]);
  expect(identity).toMatchObject({ status: "rejected", reason: { message: "WeChat QR identity unavailable" } });
});
