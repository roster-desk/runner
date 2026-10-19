import { describe, expect, it } from "vitest";
import { createTurnBook, handleTurnFrame } from "./cancel.js";

describe("turn cancel", () => {
  it("aborts the turn signal and ignores a second cancel", () => {
    const book = createTurnBook();
    const signal = book.start("turn-1", "chat-1");
    const frame = handleTurnFrame("turn.cancel", { turnId: "turn-1", conversationId: "chat-1" }, book);
    expect(signal.aborted).toBe(true);
    expect(frame).toEqual({
      handled: true,
      status: { turnId: "turn-1", conversationId: "chat-1", state: "cancelled" },
    });
    expect(book.cancel("turn-1").aborted).toBe(false);
  });
});
