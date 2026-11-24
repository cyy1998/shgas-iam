import { createPrivateKey } from "node:crypto";
import type { ProcessSmokeAttemptContext } from "@iam/test-support/process-smoke-harness";
import { createProcessSmokeEnvironment } from "@iam/test-support/process-smoke-harness";

const loginCredentialPrivateKey = "319b4e59ca80d7b4cc35955b63da4edf1ed51772ec8f33c0a4f769dda7b9fc65";
// Synthetic keys for local process fixtures only.
const signingKeyPem = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3S2v80phN5e4e
7g+nFQqPRIb4Qs0tfQJ69sQ9QhLE0yyaJ+yf64MSAPUXniZ9Gv/Hb0HGF0m9erkJ
OuW6hRXqoobU/l13ArJzSzr7mrj2eRbQjBQ33J+25kg4q8qg0m9HEZISY6kY45tN
eiE/1dw2/NqBGaOtM2NXv6A8LeaY5v836+8dWbBHM/LqEANtB+KngN4AK6phWHCe
8/OXDYDq/6DssDlULEDp8tfvF1MrybbjCk0C8pHQlE1DIQKX5i7Eufn2uI9sx8TP
KwWAzK0grAuCi9aX7nln0tLddY4zh9FxrObYtVYuZo64uqqUnbTPcYSEpHS2+TYm
15ZqbF5jAgMBAAECggEAGNHgtI0mdzM8aaRzgCd26kGC7pkfxBoaZ4uEtTAo7yK9
S76TlHAaq9RvW8cG5TKZEhNnBQDgSQUWNewWHDSrQWjH+I2HxcwaspwBnP0C23U4
I/3j5aXoBqdA06kHjia7T2n6Aqggx1sCtkdkZeAlVVjV6bIOxNmhiR9MqPl6MUKo
uCypYUyxRRNg+o1/aAQ7MaPMMN93OXBqpsV0GyY1+LeL0zJQ6h3322qdrT/xAp/V
FBOb1OTJcwb/H/Io96KoU8Ug/eve/0uf8sXR53cCjvZLjDrhqXKWphBh8u/x0RdA
tKgbup6nbbWvCX6fVJ2uV5K8mu5OddmzOD2MwQ68aQKBgQDu6VzIP4H2YBvLFJWw
OfwLaagz4LfmQzAeyfG+dmQK0GWH8F5HbM3zBvNufijZj3xTpnQH79OFTQ4tGe9R
ZD8Prc4k1SzZn0i2t2j25/erpOIEBwHDO/c1QPxrjsKOEGDuZfvQfOopPiTC3Dk2
OVzlBYnKA6LVXreq5Czw6fx8nQKBgQDEZ6yUSQb9iXTtP0QhwAEagegmmTxlVBpC
Qj2POCdY4j0d73+MmVl/Qxfrcyxkl+wL4Vez643LC6aabUF5YO9ADyhjx3gp6HXM
NDBZbZolqxzL5dueyaU9upKre8L9Lytpg86xVXIh4Sg03qjpuCkBGbubOVBawEi+
gSMaZHXW/wKBgQDOQXOTgZhunmyAN6Y/POAG7lGDcBbz2L97ZTaqCsW1vFJbOL38
BcgLbs3Mb2hO4xwfj42OqJLA+1QoxcIhT11N6OwWSl/tBSGedNtOhdcBPVjOx0nT
RjrWo+MH7Hi0cxlr12m9hYoWzwqnm75cvMshAVYCrH7wnFQOWe0ek7Mh1QKBgCpe
mzJaFrH3R0wvC8mkHBjV0XkSMZ9CZ2/HznPpD0Pzem/MzN1N76qulKhsbjU9OOTP
NhZQSIR2/PfvfeJrcPGG05XC4D9aMJ9e2tdP96MMqOerrJcytPz+FMn9pvDrjhfz
IVHMNxTr97qAFjxlSCM+o+Q2lwkc1hSS0znMVkeNAoGBAN2fVTAl4MhQ00ymR1i5
rw/qgtSmPcToYRMvS5LbHCBCctBXSirnuRofZlucSB1IflQyiUg2SY+OlPAM4wn+
qo+YJp33hT+nCxt9dAabzjbHxBTt1ZYj9hlF09/ztfBKjRjptNOpsZnqStwX2/yt
YZHtFjmIgi8tLZMBlHD/3S8D
-----END PRIVATE KEY-----`;
const previousKeyPem = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCzKWYQ1AgcRNqv
QKjpDJc5nv6OIdHOq4zsfHs8rfI+WrEgo6PD3c5awU/4k4m4nM0QzYPMShFaMZ4h
CVs3QMaS7EBQ9LV0wLZMcPVuDlD+iBWJzKLBOx6nOYZyaCWqJjvfvYUZc0QaiLma
8INqWH4FcG7DzXwCiCzXIiuN8QJOA84IAthLn6b8kpLC9eRyogGywKiuaKdtlQ3W
nJUoO2HuDf6l5NfNp5wCAaU/jHsxzEJemp7Fkf0Fpg2ytlg9neafAOEzZ+tr7ZCr
1weOWDfTBXimcucRIDsy190C7ORiKe+s8nZqAVZIlVoAoLCv6DLh+pQAsgPlK8wC
T1KLafmzAgMBAAECggEACVI4Ztxmhkn9cqwTiE8eYwy8Q7AgwUw4QGmC4+JM6HpB
cuhF8ep3/PgdGAVdCfImfR75d3HMZfvk3+UjuMPcUPKNBL6RM5TUfIpNSpTgw+Kt
SYZlsACfv1Av3YNA9RGY1d1/WkFJTslu6/piwUVUsSXArYaNqCK7lSnISFHnWSBP
pfcRtHNInQI6qIf0QbQ71OHsSYZPDDLtZ8g5+HGmolrR2U05OkfZJkmOjvG8Qq2O
LwUCONTDgMqznPJ2qDx7Voe4KEl6kj+bWyf795CJlD+IbIZoK0JHO4XX3bYWbjAY
6dGp3RQDwGi8iBNgk3RjlrNJkEFYXXR8u3Af8yi4+QKBgQD7Lo1VLDAI66fHXveV
x6RtJihf2WmUHt07b3mlw2wm8xB0M0BsrJzC+WQmJ9gdQLdzVQpKaGWyVwvJjQFx
wP5bvtEpJMcG0M+ephzhOr4a9jThbPLZr9z0fU5tf26FQxk/PsqiDvZ09TXuP1dJ
xURoYjv/GWi9a1claqB4Wk6xbwKBgQC2mS+pczOsXAjgdMpeD2L5WUh8bcpzcpvF
fFykAzVCVoExJI2N4Or0zaYeBpbR4qErflmNdlnkAU0T8mVRzLLlK/0QIFMlJU1T
cd4ndi0iiOQpTVv2IUkYeXEOJHhUVs98jkv9/qcCutJ/vZbvuePbSQuE/uS4g21T
YjyAGUfR/QKBgFdiiqjnBo8T7PrffyMMoZeXftRZvvFZC35x+dBBfI7QYRkL+43T
P3ZVbRIZKoaCzU/CdiIMz9SLk/46oBYDHnqsl/fIY7VrT8/R2ppA5YJbxWnnjVVO
aYBlV7OgccLK5S2rmrNmoTdvV6PbRXLUvkfSZS0KmfXMMjVCMzGruVThAoGAdLR9
yQDPcwczyTn8KZgN+y68bILDlXwX4WX11AIU5TxiwCULsDWkFijmVmSBus3tkt3j
oM2W8GqAeBJB/cEmSeEOkmMGoUQxIvcxNOmMOXli0p8V+r8Vd+YOgyp+GfGOFZ7h
JQrAdbcwWOK0+K1H29zY1v0O9HtTwaqU3o7J34UCgYEAgs4A3cJLwBvKDQlefbPu
tffw3lXkkL8vQW8z6lBePvaq0w46BqkPTMlE9NG1ow8HcpW6dH3WAUOXAqtPNAT8
W7GCffjJyd6i+yTgJQ7On2aksI9yjPJK9MwjeS6nCh+y4WLeVfZH4mxjR0kgneG1
OOMqsP/q+xlv+JOM28WLhPc=
-----END PRIVATE KEY-----`;

function signingJwk(pem: string, kid: string) {
  return JSON.stringify({ ...createPrivateKey(pem).export({ format: "jwk" }), kid, alg: "RS256", use: "sig" });
}

const signingKey = signingJwk(signingKeyPem, "api-process");
const previousKey = signingJwk(previousKeyPem, "api-previous");

export function createEntryEnvironment(context: ProcessSmokeAttemptContext, overrides: NodeJS.ProcessEnv = {}) {
  const origin = `http://${context.hostname}:${context.port}`;
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory: context.temporaryDirectory,
    overrides: {
      NODE_ENV: "production",
      IAM_API_OIDC_CURRENT_JWK_JSON: signingKey,
      IAM_API_OIDC_PREVIOUS_JWK_JSON: previousKey,
      IAM_API_OIDC_COOKIE_SECURE: "false",
      IAM_API_DATABASE_URL: "postgresql://iam:password@127.0.0.1:1/iam",
      IAM_API_PASSWORD_HASH_ROUNDS: "4",
      IAM_API_SMS_SIGNATURE_KEY: "unreachable-smoke-signature",
      IAM_API_SMS_URL: "http://127.0.0.1:1/sms",
      IAM_API_CUSTOM_SSO_TOKEN_TTL_SECONDS: "3600",
      IAM_API_AUTH_CODE_TTL_SECONDS: "300",
      IAM_API_CUSTOM_SSO_PROJECTION_RETRY_AFTER_SECONDS: "7",
      IAM_API_PORT: String(context.port),
      IAM_API_WECHAT_CORP_ID: "unreachable-smoke-corp",
      IAM_API_WECHAT_CORP_SECRET: "unreachable-smoke-secret",
      IAM_API_MAGIC_CODE: "000000",
      IAM_API_REDIS_URL: "redis://127.0.0.1:1/15",
      IAM_API_LOGIN_ENDPOINT: "/login",
      IAM_API_SSO_INTERNAL_ORIGIN: origin,
      IAM_API_SSO_EXTERNAL_ORIGIN: origin,
      IAM_API_AUTHORIZATION_ENDPOINT: "/sso/authorize",
      IAM_API_LOGOUT_ENDPOINT: "/sso/logout",
      IAM_API_THIRDPARTY_OA_ENDPOINT: "/sso/thirdparty/oa",
      IAM_API_LOG_LEVEL: "info",
      IAM_API_LOG_FORMAT: "json",
      IAM_API_CAP_ENABLED: "false",
      IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID: "entry-smoke",
      IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: JSON.stringify({
        "entry-smoke": loginCredentialPrivateKey,
      }),
      IAM_API_SESSION_KERNEL_NAMESPACE: `sess:api-entry-smoke:${context.port}:`,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
      ...overrides,
    },
  });
}
