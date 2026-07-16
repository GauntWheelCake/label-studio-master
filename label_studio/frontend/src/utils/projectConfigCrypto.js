import { gcm } from "@noble/ciphers/aes";

const bytesToBase64 = (bytes) => {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return window.btoa(binary);
};

const base64ToBytes = (value) => {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

export const encryptProjectConfigPayload = async (payload, encodedKey) => {
  if (!encodedKey || !window.crypto?.getRandomValues) {
    throw new Error("Project configuration encryption is unavailable");
  }

  let keyBytes;
  try {
    keyBytes = base64ToBytes(encodedKey);
  } catch (error) {
    throw new Error("Project configuration encryption key is invalid");
  }
  if (keyBytes.length !== 32) {
    throw new Error("Project configuration encryption key is invalid");
  }

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  let ciphertext;

  if (window.crypto.subtle) {
    const key = await window.crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
    ciphertext = new Uint8Array(await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  } else {
    ciphertext = gcm(keyBytes, iv).encrypt(plaintext);
  }

  return {
    encrypted: true,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  };
};
