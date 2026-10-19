import fs from "node:fs";
import path from "node:path";

export type SecretStore = {
  get(): string | null;
  set(value: string): void;
  delete(): void;
};

const SERVICE = "roster-desk";
const ACCOUNT = "runner-keys";

export function fileSecretStore(dir: string): SecretStore {
  const file = path.join(dir, "runner-keys.json");
  return {
    get() {
      if (!fs.existsSync(file)) return null;
      return fs.readFileSync(file, "utf8");
    },
    set(value) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(file, value, { mode: 0o600 });
      fs.chmodSync(file, 0o600);
    },
    delete() {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    },
  };
}

export async function openKeychain(): Promise<SecretStore | null> {
  try {
    const { Entry } = await import("@napi-rs/keyring");
    const entry = new Entry(SERVICE, ACCOUNT);
    return {
      get: () => entry.getPassword(),
      set: (value) => entry.setPassword(value),
      delete: () => {
        entry.deletePassword();
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.warn(`[runner] 키체인을 열지 못했습니다. ${message}`);
    return null;
  }
}
