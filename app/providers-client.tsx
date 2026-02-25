"use client";

import {
  CrossmintAuthProvider,
  CrossmintProvider,
  CrossmintWalletProvider,
} from "@crossmint/client-sdk-react-ui";
import { resolvePrimaryEvmChain } from "@/lib/crossmint/chains";
import { DemoSessionProvider } from "@/state/demo-session-provider";

const appearance = {
  colors: {
    accent: "#FF4500",
  },
};

function isValidCrossmintApiKey(value: string | undefined): value is string {
  return Boolean(value && /^(ck|sk)_(development|staging|production)_/.test(value));
}

export function ProvidersClient({ children }: { children: React.ReactNode }) {
  const crossmintApiKey = process.env.NEXT_PUBLIC_CROSSMINT_API_KEY;
  const primaryEvmChain = resolvePrimaryEvmChain(
    process.env.NEXT_PUBLIC_CROSSMINT_EVM_CHAIN,
  );

  if (!isValidCrossmintApiKey(crossmintApiKey)) {
    return (
      <DemoSessionProvider crossmintDisabledReason="Set NEXT_PUBLIC_CROSSMINT_API_KEY to a valid Crossmint key (ck_staging_..., ck_production_...).">
        {children}
      </DemoSessionProvider>
    );
  }

  return (
    <CrossmintProvider apiKey={crossmintApiKey}>
      <CrossmintAuthProvider
        loginMethods={["email"]}
        authModalTitle="Crossmint + Machines"
        appearance={appearance}
      >
        <CrossmintWalletProvider
          appearance={appearance}
          createOnLogin={{
            chain: primaryEvmChain,
            signer: {
              type: "email",
            },
          }}
        >
          <DemoSessionProvider>{children}</DemoSessionProvider>
        </CrossmintWalletProvider>
      </CrossmintAuthProvider>
    </CrossmintProvider>
  );
}
