import { expect, test } from "bun:test";
import { dockerSandbox } from "../sandbox.mts";

test("dedicated daemon socket is resolved by the daemon rather than client path validation", () => {
  const provider = dockerSandbox({ network: "host", daemonAccess: { socketGroupId: 123 } });
  expect(provider.env.DOCKER_HOST).toBe("unix:///var/run/docker.sock");
});

test.each([-1, 1.5, Number.NaN])("rejects invalid socket group %s", (socketGroupId) => {
  expect(() => dockerSandbox({ network: "host", daemonAccess: { socketGroupId } })).toThrow("GID");
});

test("daemon access requires the selected host network architecture", () => {
  expect(() => dockerSandbox({ network: "bridge", daemonAccess: { socketGroupId: 123 } })).toThrow("host networking");
});

test("dedicated socket cannot inject another Docker mount option", () => {
  expect(() => dockerSandbox({ daemonSocket: "/var/run/docker.sock,target=/tmp/other" })).toThrow("mount delimiters");
});
