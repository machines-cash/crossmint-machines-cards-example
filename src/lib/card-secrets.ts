export async function decryptCardSecret(
  secretKeyHex: string,
  base64Data: string,
  base64Iv: string,
): Promise<string> {
  if (!/^[0-9a-fA-F]{32}$/.test(secretKeyHex)) {
    throw new Error("secretKey must be a 16-byte hex string");
  }

  const key = hexToBytes(secretKeyHex);
  const iv = base64ToBytes(base64Iv);
  const payload = base64ToBytes(base64Data);
  const tagLength = 16;
  if (payload.length <= tagLength) {
    throw new Error("invalid encrypted payload");
  }

  const ciphertext = payload.subarray(0, payload.length - tagLength);
  const tag = payload.subarray(payload.length - tagLength);

  return decryptAesGcmUtf8({ key, iv, ciphertext, tag });
}

async function decryptAesGcmUtf8(input: {
  key: Uint8Array;
  iv: Uint8Array;
  ciphertext: Uint8Array;
  tag: Uint8Array;
}): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(input.key),
    {
      name: "AES-GCM",
    },
    false,
    ["decrypt"],
  );

  const combined = new Uint8Array(input.ciphertext.length + input.tag.length);
  combined.set(input.ciphertext);
  combined.set(input.tag, input.ciphertext.length);

  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(input.iv),
      tagLength: 128,
    },
    cryptoKey,
    toArrayBuffer(combined),
  );

  return new TextDecoder().decode(plaintext);
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim();
  if (normalized.length % 2 !== 0) {
    throw new Error("invalid hex length");
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export async function decryptCardSecrets(input: {
  secretKey: string;
  encryptedPan: { data: string; iv: string };
  encryptedCvc: { data: string; iv: string };
}) {
  const pan = await decryptCardSecret(
    input.secretKey,
    input.encryptedPan.data,
    input.encryptedPan.iv,
  );
  const cvc = await decryptCardSecret(
    input.secretKey,
    input.encryptedCvc.data,
    input.encryptedCvc.iv,
  );

  return {
    pan,
    cvc,
  };
}
