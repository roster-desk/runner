import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type CredentialRecord = {
  credentialId: string;
  secret: string;
  pairId: string;
  deviceId: string;
  hubWsUrl: string;
  version: number;
};

export type CredentialStore = {
  save(record: CredentialRecord): Promise<void>;
  load(): Promise<CredentialRecord | null>;
  clear(): Promise<void>;
};

export function credentialDir() {
  return process.env.RUNNER_DATA_DIR
    ? path.resolve(process.env.RUNNER_DATA_DIR)
    : path.join(os.homedir(), ".roster-desk");
}

export function fileCredentialStore(dir = credentialDir()): CredentialStore {
  const file = path.join(dir, "credential.json");
  return {
    async save(record) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(file, JSON.stringify(record), { mode: 0o600 });
      fs.chmodSync(file, 0o600);
    },
    async load() {
      if (!fs.existsSync(file)) return null;
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as CredentialRecord;
      if (!parsed.credentialId || !parsed.secret) return null;
      return parsed;
    },
    async clear() {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    },
  };
}

let warned = false;

/** v2 페어링이 끝난 뒤에 옛 평문 자격증명 파일을 지운다. */
export function clearLegacyCredential(dir = credentialDir()) {
  const file = path.join(dir, "credential.json");
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function warnFileStore() {
  if (warned) return;
  warned = true;
  console.warn(
    "[runner] 자격증명은 개발용 파일에 저장합니다. 서명된 설치본은 OS 키체인을 씁니다.",
  );
}
