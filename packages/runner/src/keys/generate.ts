import nacl from "tweetnacl";

export type RunnerKeys = {
  signPublicKey: Uint8Array;
  signSecretKey: Uint8Array;
  boxPublicKey: Uint8Array;
  boxSecretKey: Uint8Array;
};

export function generateRunnerKeys(): RunnerKeys {
  const sign = nacl.sign.keyPair();
  const box = nacl.box.keyPair();
  return {
    signPublicKey: sign.publicKey,
    signSecretKey: sign.secretKey,
    boxPublicKey: box.publicKey,
    boxSecretKey: box.secretKey,
  };
}
