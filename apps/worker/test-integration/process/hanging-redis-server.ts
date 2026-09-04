import type { Socket } from "node:net";
import { createServer } from "node:net";

export async function createHangingRedisServer() {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Hanging Redis test server did not allocate a TCP port");
  let closed = false;
  return {
    port: address.port,
    async close() {
      if (closed)
        return;
      closed = true;
      for (const socket of sockets)
        socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close(error => error ? reject(error) : resolve()));
      if (sockets.size !== 0)
        throw new Error("Hanging Redis test server left accepted sockets open");
    },
  };
}
