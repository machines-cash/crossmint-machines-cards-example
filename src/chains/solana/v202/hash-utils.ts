import crypto from "crypto-js";
import { PublicKey } from "@solana/web3.js";

export class HashUtils {
  static keccak256Hex(hexData: string): string {
    const wordArray = crypto.enc.Hex.parse(hexData);
    const hash = crypto.SHA3(wordArray, { outputLength: 256 });
    return hash.toString();
  }

  static keccak256(data: string): string {
    const hash = crypto.SHA3(data, { outputLength: 256 });
    return hash.toString();
  }

  static encodeString(value: string): string {
    return HashUtils.keccak256(value);
  }

  static encodeAddress(value: PublicKey): string {
    return value.toBuffer().toString("hex");
  }

  static encodeUInt32(value: bigint | number): string {
    return BigInt(value).toString(16).padStart(8, "0");
  }

  static encodeUInt64(value: bigint): string {
    return value.toString(16).padStart(16, "0");
  }

  static encodeBytes(value: Uint8Array): string {
    return Array.from(value)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
}

export class PaddingBytesMessage {
  static encode(): string {
    return HashUtils.encodeBytes(new Uint8Array(Buffer.from("\x19\x01", "latin1")));
  }
}

export class DomainSeparatorMessage {
  private static readonly DOMAIN_TYPE_HASH = HashUtils.encodeString(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)",
  );

  static encode(options: {
    name: string;
    version: string;
    chainId: bigint;
    verifyingContract: PublicKey;
    salt: Uint8Array;
  }): string {
    const encodedStructure = [
      DomainSeparatorMessage.DOMAIN_TYPE_HASH,
      HashUtils.encodeString(options.name),
      HashUtils.encodeString(options.version),
      HashUtils.encodeUInt64(options.chainId),
      HashUtils.encodeAddress(options.verifyingContract),
      HashUtils.encodeBytes(options.salt),
    ].join("");

    return HashUtils.keccak256Hex(encodedStructure);
  }
}
