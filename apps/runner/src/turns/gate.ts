export type TurnBegin =
  | { ok: true; signal: AbortSignal; finish: () => void; cancel: () => void }
  | { ok: false; code: "turn_in_progress" | "busy" };

export function createTurnGate(max = 4) {
  const active = new Map<string, AbortController>();
  return {
    begin(sessionKey: string): TurnBegin {
      if (active.has(sessionKey)) return { ok: false, code: "turn_in_progress" };
      if (active.size >= max) return { ok: false, code: "busy" };
      const controller = new AbortController();
      active.set(sessionKey, controller);
      return {
        ok: true,
        signal: controller.signal,
        finish() {
          active.delete(sessionKey);
        },
        cancel() {
          controller.abort();
          active.delete(sessionKey);
        },
      };
    },
  };
}
