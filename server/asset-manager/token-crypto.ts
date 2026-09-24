import { createHash, randomBytes, createCipheriv, createDecipheriv } from "crypto";

function getEncryptionKey(): Buffer {
  const secret = process.env.SIGNSUITEIQ_SSO_SECRET;
  if (!secret) throw new Error("SIGNSUITEIQ_SSO_SECRET is not configured — cannot encrypt tokens");
  return createHash("sha256").update(secret).digest();
}

export function encryptToken(plain: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(stored: string): string {
  const key = getEncryptionKey();
  const parts = stored.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted token format");
  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}

export function maskToken(plain: string): string {
  if (plain.length <= 4) return "••••";
  return "•".repeat(Math.max(8, plain.length - 4)) + plain.slice(-4);
}
