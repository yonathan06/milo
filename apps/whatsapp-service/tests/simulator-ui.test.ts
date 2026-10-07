import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";
import { setImmediate } from "node:timers/promises";

test("simulator displays sent messages and pushed replies without polling state", async () => {
  const requests: string[] = [];
  const listeners = new Map<string, Map<string, () => unknown>>();
  const elements = new Map<string, any>();
  function element(id: string) {
    if (!elements.has(id)) elements.set(id, {
      value: id === "sender" ? "4910000000787" : "Hello",
      checked: id === "auto-dispatch", children: [], scrollHeight: 0, scrollTop: 0, clientHeight: 0,
      classList: { toggle() {} }, append() {}, prepend() {}, replaceChildren() {},
      addEventListener(event: string, listener: () => unknown) {
        if (!listeners.has(id)) listeners.set(id, new Map());
        listeners.get(id)!.set(event, listener);
      },
    });
    return elements.get(id);
  }
  const incoming = { id: "message-1", sequence: "1", direction: "inbound", text: "Hello", content: { version: 1 }, acceptedAt: new Date().toISOString() };
  const state = { conversation: { id: "chat-1" }, messages: [incoming], intents: [], runs: [], responder: { mode: "agent", readiness: "ready" } };
  const sockets: MockSocket[] = [];
  class MockSocket {
    readyState = 1;
    listeners = new Map<string, (event: { data: string }) => void>();
    constructor(url: URL) {
      assert.equal(url.protocol, "ws:");
      assert.equal(url.pathname, "/dev/events");
      assert.equal(url.searchParams.get("sender"), "4910000000787");
      sockets.push(this);
    }
    addEventListener(event: string, listener: (event: { data: string }) => void) { this.listeners.set(event, listener); }
    close() { this.readyState = 3; }
    push(update: unknown) { this.listeners.get("message")!({ data: JSON.stringify(update) }); }
  }
  const context = createContext({
    URL, WebSocket: MockSocket, window: { location: { href: "http://127.0.0.1:8787/" } },
    document: { getElementById: element, createElement: () => element(`created-${elements.size}`) },
    fetch: async (path: string) => {
      requests.push(path);
      return { ok: true, json: async () => path.startsWith("/dev/state")
        ? { messages: [], intents: [], runs: [], responder: { mode: "agent", readiness: "ready" } }
        : path === "/dev/send" ? { providerMessageId: "test-message", webhookStatus: 200, state }
        : { published: 1, scheduled: 1 } };
    },
    // A regression to periodic polling should fail rather than start a timer.
    setInterval: () => { throw new Error("State polling is not allowed"); },
  });
  runInContext(await readFile(new URL("../ui/app.js", import.meta.url), "utf8"), context);
  await setImmediate();
  assert.deepEqual(requests, ["/dev/state?sender=4910000000787"]);
  await runInContext("send()", context);
  assert.deepEqual(requests, ["/dev/state?sender=4910000000787", "/dev/send", "/dev/dispatch"]);
  assert.equal(element("message-count").textContent, 1, "sent message renders from the send response");
  assert.equal(sockets.length, 1);
  sockets[0].push({ type: "state", state: { ...state, messages: [incoming, { ...incoming, id: "reply-1", sequence: "2", direction: "outbound", text: "Agent reply" }] } });
  assert.equal(element("message-count").textContent, 2, "reply renders from the WebSocket payload");
  assert.equal(requests.filter(path => path.startsWith("/dev/state")).length, 1);
  // Late updates from a previous sender cannot contaminate the displayed chat.
  element("sender").value = "4910000000799";
  sockets[0].push({ type: "state", state: { ...state, messages: [] } });
  assert.equal(element("message-count").textContent, 2);
  element("sender").value = "4910000000787";
  await listeners.get("refresh")!.get("click")!();
  assert.equal(requests.filter(path => path.startsWith("/dev/state")).length, 2);
  listeners.get("sender")!.get("change")!();
  await setImmediate();
  assert.equal(requests.filter(path => path.startsWith("/dev/state")).length, 3);
});
