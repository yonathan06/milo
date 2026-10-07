export const TEST_RESPONDER_VERSION = "deterministic-v1";

export function testResponse(input: { contentType: string; text: string | null }): string {
  if (input.contentType !== "text") return "Milo test responder: I can only handle text messages for now.";
  return `Milo test responder: I received your message.\n\n${(input.text ?? "").slice(0, 3000)}`;
}
