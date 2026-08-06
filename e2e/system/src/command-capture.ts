import { Buffer } from "node:buffer";

export function createBoundedByteCapture(
  mode: "prefix" | "tail",
  maxBytes: number,
) {
  if (!Number.isInteger(maxBytes) || maxBytes <= 0)
    throw new Error("capture byte limit must be a positive integer");
  let chunks: Buffer[] = [];
  let byteLength = 0;
  return {
    append(chunk: Buffer) {
      if (mode === "prefix") {
        if (byteLength >= maxBytes)
          return;
        const bounded = Buffer.from(chunk.subarray(0, maxBytes - byteLength));
        chunks.push(bounded);
        byteLength += bounded.length;
        return;
      }
      if (chunk.length >= maxBytes) {
        chunks = [Buffer.from(chunk.subarray(-maxBytes))];
        byteLength = maxBytes;
        return;
      }
      chunks.push(Buffer.from(chunk));
      byteLength += chunk.length;
      while (byteLength > maxBytes) {
        const first = chunks[0];
        if (first === undefined)
          break;
        const overflow = byteLength - maxBytes;
        if (first.length <= overflow) {
          chunks.shift();
          byteLength -= first.length;
        }
        else {
          chunks[0] = Buffer.from(first.subarray(overflow));
          byteLength -= overflow;
        }
      }
    },
    toString() {
      let value = Buffer.concat(chunks, byteLength).toString("utf8");
      while (Buffer.byteLength(value, "utf8") > maxBytes)
        value = value.slice(1);
      return value;
    },
  };
}

export function createBoundedLineCapture(maxBytes: number) {
  const truncated = Buffer.from("[TRUNCATED]", "utf8");
  if (!Number.isInteger(maxBytes) || maxBytes < truncated.length)
    throw new Error("line capture byte limit must fit the truncation marker");
  const entries: Buffer[] = [];
  let entriesBytes = 0;
  let pending: Buffer[] = [];
  let pendingBytes = 0;
  let oversized = false;
  const retain = (entry: Buffer) => {
    entries.push(entry);
    entriesBytes += entry.length;
    while (entriesBytes > maxBytes) {
      const removed = entries.shift();
      if (removed === undefined)
        break;
      entriesBytes -= removed.length;
    }
  };
  const appendLineSegment = (segment: Buffer) => {
    if (oversized || segment.length === 0)
      return;
    if (pendingBytes + segment.length > maxBytes) {
      pending = [];
      pendingBytes = 0;
      oversized = true;
      return;
    }
    pending.push(Buffer.from(segment));
    pendingBytes += segment.length;
  };
  const finishLine = (withNewline: boolean) => {
    let entry: Buffer;
    if (oversized) {
      entry = withNewline
        ? Buffer.concat([truncated, Buffer.from("\n")])
        : truncated;
    }
    else {
      let content = Buffer.concat(pending, pendingBytes);
      if (content.at(-1) === 0x0D)
        content = content.subarray(0, -1);
      entry = withNewline
        ? Buffer.concat([content, Buffer.from("\n")])
        : content;
      if (entry.length > maxBytes) {
        entry = withNewline
          ? Buffer.concat([truncated, Buffer.from("\n")])
          : truncated;
      }
    }
    retain(entry);
    pending = [];
    pendingBytes = 0;
    oversized = false;
  };
  return {
    append(chunk: Buffer) {
      let cursor = 0;
      for (;;) {
        const newline = chunk.indexOf(0x0A, cursor);
        if (newline < 0) {
          appendLineSegment(chunk.subarray(cursor));
          return;
        }
        appendLineSegment(chunk.subarray(cursor, newline));
        finishLine(true);
        cursor = newline + 1;
      }
    },
    toString() {
      const tail = [...entries];
      let tailBytes = entriesBytes;
      if (oversized || pendingBytes > 0) {
        const finalEntry = oversized
          ? truncated
          : Buffer.concat(pending, pendingBytes);
        tail.push(finalEntry);
        tailBytes += finalEntry.length;
        while (tailBytes > maxBytes) {
          const removed = tail.shift();
          if (removed === undefined)
            break;
          tailBytes -= removed.length;
        }
      }
      return Buffer.concat(tail, tailBytes).toString("utf8");
    },
  };
}
