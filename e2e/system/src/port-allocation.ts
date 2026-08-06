import { createServer } from "node:net";

export async function allocateAvailablePort(hostname = "127.0.0.1") {
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, hostname, () => resolve());
  });
  const address = reservation.address();
  await new Promise<void>((resolve, reject) => reservation.close(error =>
    error === undefined ? resolve() : reject(error)));
  if (address === null || typeof address === "string")
    throw new Error("failed to allocate an available TCP port");
  return address.port;
}
