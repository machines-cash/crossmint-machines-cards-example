"use client";

import dynamic from "next/dynamic";

const ProvidersClient = dynamic(
  () => import("./providers-client").then((module) => module.ProvidersClient),
  { ssr: false },
);

export function Providers({ children }: { children: React.ReactNode }) {
  return <ProvidersClient>{children}</ProvidersClient>;
}
