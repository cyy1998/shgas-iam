// Windows has no POSIX signal delivery. Deliver the runtime signal event in this
// child only, while executing the actual CLI and its production signal listener.
setTimeout(() => process.emit("SIGTERM", "SIGTERM"), 500);
