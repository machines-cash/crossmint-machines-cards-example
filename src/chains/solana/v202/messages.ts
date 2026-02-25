import { PublicKey } from "@solana/web3.js";
import { DomainSeparatorMessage, HashUtils, PaddingBytesMessage } from "./hash-utils";
import type { WithdrawCollateralRequest } from "./types";

const COLLATERAL_ADMIN_SIGNATURE_SEED = Buffer.from("CollateralAdminSignatures", "utf-8");

export class CollateralMessage {
  private static readonly WITHDRAW_TYPE_HASH = HashUtils.encodeString(
    "Withdraw(address user,address asset,uint256 amount,address recipient,uint256 nonce)",
  );

  static generateAdminSignaturePda(
    collateral: PublicKey,
    id: Buffer,
    programId: PublicKey,
  ): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [COLLATERAL_ADMIN_SIGNATURE_SEED, collateral.toBuffer(), id],
      programId,
    );
    return pda;
  }

  static encodeWithdrawMessage(options: {
    collateral: PublicKey;
    sender: PublicKey;
    receiver: PublicKey;
    asset: PublicKey;
    request: WithdrawCollateralRequest;
    adminFundsNonce: number;
  }): string {
    const amount = BigInt(options.request.amountOfAsset.toString());

    const encodedStructure = [
      CollateralMessage.WITHDRAW_TYPE_HASH,
      HashUtils.encodeAddress(options.sender),
      HashUtils.encodeAddress(options.collateral),
      HashUtils.encodeAddress(options.asset),
      HashUtils.encodeUInt64(amount),
      HashUtils.encodeAddress(options.receiver),
      HashUtils.encodeUInt32(options.adminFundsNonce),
    ].join("");

    return HashUtils.keccak256Hex(encodedStructure);
  }

  static getWithdrawMessage(options: {
    collateral: PublicKey;
    sender: PublicKey;
    receiver: PublicKey;
    asset: PublicKey;
    request: WithdrawCollateralRequest;
    salt: number[];
    adminFundsNonce: number;
    domainChainId: bigint;
  }): Buffer {
    const encodedData = [
      PaddingBytesMessage.encode(),
      DomainSeparatorMessage.encode({
        name: "Collateral",
        version: "2",
        chainId: options.domainChainId,
        verifyingContract: options.collateral,
        salt: new Uint8Array(options.salt),
      }),
      CollateralMessage.encodeWithdrawMessage({
        collateral: options.collateral,
        sender: options.sender,
        receiver: options.receiver,
        asset: options.asset,
        request: options.request,
        adminFundsNonce: options.adminFundsNonce,
      }),
    ].join("");

    return Buffer.from(HashUtils.keccak256Hex(encodedData), "hex");
  }

  static generateWithdrawCollateralPda(options: {
    collateral: PublicKey;
    sender: PublicKey;
    receiver: PublicKey;
    asset: PublicKey;
    request: WithdrawCollateralRequest;
    adminFundsNonce: number;
    programId: PublicKey;
  }) {
    const encoded = CollateralMessage.encodeWithdrawMessage({
      collateral: options.collateral,
      sender: options.sender,
      receiver: options.receiver,
      asset: options.asset,
      request: options.request,
      adminFundsNonce: options.adminFundsNonce,
    });

    return CollateralMessage.generateAdminSignaturePda(
      options.collateral,
      Buffer.from(encoded, "hex"),
      options.programId,
    );
  }
}

export class CoordinatorMessage {
  private static readonly WITHDRAW_TYPE_HASH = HashUtils.encodeString(
    "Withdraw(address user,address collateral,address asset,uint256 amount,address recipient,uint256 nonce,uint256 expiresAt)",
  );

  static encodeWithdrawMessage(options: {
    collateral: PublicKey;
    sender: PublicKey;
    receiver: PublicKey;
    asset: PublicKey;
    request: WithdrawCollateralRequest;
    adminFundsNonce: number;
  }): string {
    const amount = BigInt(options.request.amountOfAsset.toString());
    const expiresAt = BigInt(options.request.signatureExpirationTime.toString());

    const encodedStructure = [
      CoordinatorMessage.WITHDRAW_TYPE_HASH,
      HashUtils.encodeAddress(options.sender),
      HashUtils.encodeAddress(options.collateral),
      HashUtils.encodeAddress(options.asset),
      HashUtils.encodeUInt64(amount),
      HashUtils.encodeAddress(options.receiver),
      HashUtils.encodeUInt32(options.adminFundsNonce),
      HashUtils.encodeUInt64(expiresAt),
    ].join("");

    return HashUtils.keccak256Hex(encodedStructure);
  }

  static getWithdrawMessage(options: {
    collateral: PublicKey;
    coordinator: PublicKey;
    sender: PublicKey;
    receiver: PublicKey;
    asset: PublicKey;
    request: WithdrawCollateralRequest;
    adminFundsNonce: number;
    domainChainId: bigint;
  }): Buffer {
    const encodedData = [
      PaddingBytesMessage.encode(),
      DomainSeparatorMessage.encode({
        name: "Coordinator",
        version: "2",
        chainId: options.domainChainId,
        verifyingContract: options.coordinator,
        salt: new Uint8Array(options.request.coordinatorSignatureSalt),
      }),
      CoordinatorMessage.encodeWithdrawMessage({
        collateral: options.collateral,
        sender: options.sender,
        receiver: options.receiver,
        asset: options.asset,
        request: options.request,
        adminFundsNonce: options.adminFundsNonce,
      }),
    ].join("");

    return Buffer.from(HashUtils.keccak256Hex(encodedData), "hex");
  }
}
