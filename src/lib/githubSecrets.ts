import sealedbox from "tweetnacl-sealedbox-js";
import { getActionsPublicKey, putActionsSecret } from "./github";

/**
 * Encrypt a secret value for a repo's Actions secrets endpoint. GitHub expects
 * a libsodium sealed box against the repo's public key, base64-encoded.
 * `tweetnacl-sealedbox-js` implements exactly that sealed-box construction.
 */
export function encryptForRepo(publicKeyBase64: string, secret: string): string {
  const publicKey = new Uint8Array(Buffer.from(publicKeyBase64, "base64"));
  const message = new Uint8Array(Buffer.from(secret, "utf8"));
  const sealed = sealedbox.seal(message, publicKey);
  return Buffer.from(sealed).toString("base64");
}

/** Fetch the repo key, encrypt, and upload one secret in one go. */
export async function setRepoSecret(
  token: string,
  owner: string,
  repo: string,
  name: string,
  value: string,
): Promise<void> {
  const { keyId, key } = await getActionsPublicKey(token, owner, repo);
  const encrypted = encryptForRepo(key, value);
  await putActionsSecret(token, owner, repo, name, encrypted, keyId);
}
