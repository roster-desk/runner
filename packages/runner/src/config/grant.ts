import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import { credentialDir } from "../credential-store.js";
import type { ApplyResult } from "../policy/apply.js";
import { PolicyFile } from "./schema.js";

type Grant = NonNullable<ApplyResult["grant"]>;

/** 폰에서 '항상 허용'한 규칙을 policy.yaml의 granted 끝에 붙인다. 주석과 순서는 그대로 둔다. */
export function savePhoneGrant(grant: Grant, dir = credentialDir()) {
  const file = path.join(dir, "policy.yaml");
  const doc = parseDocument(fs.readFileSync(file, "utf8"));
  const current = PolicyFile.parse(doc.toJS());
  if (current.granted.some((item) => item.agent === grant.agent && item.tool === grant.tool)) return false;
  if (!doc.has("granted")) doc.set("granted", doc.createNode([]));
  doc.addIn(["granted"], doc.createNode(grant));
  fs.writeFileSync(file, doc.toString());
  return true;
}

export function readPolicy(dir = credentialDir()) {
  const doc = parseDocument(fs.readFileSync(path.join(dir, "policy.yaml"), "utf8"));
  return PolicyFile.parse(doc.toJS());
}
