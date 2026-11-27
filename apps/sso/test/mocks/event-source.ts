import { vi } from "vitest";

export function stubEventSource() {
  const sources: ControlledEventSource[] = [];
  class ControlledEventSource {
    static readonly CLOSED = 2;
    readonly url: URL;
    readonly withCredentials: boolean;
    readyState = 1;
    onmessage?: (event: MessageEvent) => void;
    onerror?: () => void;

    constructor(url: string, options?: EventSourceInit) {
      this.url = new URL(url, window.location.href);
      this.withCredentials = options?.withCredentials ?? false;
      sources.push(this);
    }

    emit(data: unknown) {
      this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
    }

    close() {
      this.readyState = ControlledEventSource.CLOSED;
    }
  }

  vi.stubGlobal("EventSource", ControlledEventSource);
  return sources;
}
