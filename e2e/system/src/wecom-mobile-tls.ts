import { createHash, X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";

// This fixture is synthetic and used only for the E2E APISIX listener and its clients.
const certificateFile = new URL("../test-assets/wecom-mobile-cert.pem", import.meta.url);

export function readWecomMobileCertificate() {
  return readFileSync(certificateFile, "utf8");
}

export function wecomMobileCertificatePin() {
  const certificate = new X509Certificate(readWecomMobileCertificate());
  const publicKey = certificate.publicKey.export({ type: "spki", format: "der" });
  return createHash("sha256").update(publicKey).digest("base64");
}
