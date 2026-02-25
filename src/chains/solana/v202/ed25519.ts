import {
  Ed25519Program,
  PublicKey,
  type TransactionInstruction,
} from "@solana/web3.js";

export function createSignatureVerificationInstruction(input: {
  signer: PublicKey;
  signature: Buffer;
  message: Buffer;
}): TransactionInstruction {
  return Ed25519Program.createInstructionWithPublicKey({
    publicKey: input.signer.toBytes(),
    signature: input.signature,
    message: input.message,
  });
}
