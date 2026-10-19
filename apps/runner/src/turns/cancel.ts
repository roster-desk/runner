export function createTurnBook() {
  const active = new Map<string, { controller: AbortController; conversationId: string }>();
  return {
    start(turnId: string, conversationId: string) {
      const controller = new AbortController();
      active.set(turnId, { controller, conversationId });
      return controller.signal;
    },
    cancel(turnId: string) {
      const row = active.get(turnId);
      if (!row) return { state: "cancelled" as const, aborted: false, conversationId: "" };
      row.controller.abort();
      active.delete(turnId);
      return { state: "cancelled" as const, aborted: true, conversationId: row.conversationId, signal: row.controller.signal };
    },
  };
}

export function handleTurnFrame(
  type: string | undefined,
  data: { turnId?: unknown; conversationId?: unknown } | undefined,
  book: ReturnType<typeof createTurnBook>,
) {
  const turnId = typeof data?.turnId === "string" ? data.turnId : "";
  const conversationId = typeof data?.conversationId === "string" ? data.conversationId : "";
  if (type === "turn.start" && turnId) {
    book.start(turnId, conversationId);
    return { handled: true as const };
  }
  if (type === "turn.cancel" && turnId) {
    const result = book.cancel(turnId);
    return {
      handled: true as const,
      status: { turnId, conversationId: result.conversationId || conversationId, state: "cancelled" as const },
    };
  }
  return { handled: false as const };
}
