import fs from "node:fs";
import { credentialDir } from "../credential-store.js";
import { catalogFrame, readRoster, type CatalogAgent } from "./load.js";

export function watchRoster(dir = credentialDir(), send: (frame: ReturnType<typeof catalogFrame>) => void) {
  fs.mkdirSync(dir, { recursive: true });
  const emit = () => {
    const roster = readRoster(dir);
    if (!roster.ok) {
      for (const error of roster.errors) console.error(`[runner] ${error}`);
      return;
    }
    send(catalogFrame(roster.catalog));
  };
  const watcher = fs.watch(dir, () => emit());
  return () => watcher.close();
}

export function publishRoster(dir = credentialDir()) {
  const roster = readRoster(dir);
  if (!roster.ok) return roster;
  return { ok: true as const, frame: catalogFrame(roster.catalog), agents: roster.agents };
}

export type { CatalogAgent };
