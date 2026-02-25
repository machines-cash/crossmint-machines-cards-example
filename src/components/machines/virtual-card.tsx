"use client";

import type { PartnerCard } from "@/types/partner";

type VirtualCardProps = {
  card: PartnerCard;
  label?: string;
  revealedPan?: string;
  revealedCvc?: string;
  children?: React.ReactNode;
};

const STATUS_THEME: Record<string, string> = {
  active: "linear-gradient(140deg, #ff4500, #c83900)",
  locked: "linear-gradient(140deg, #666666, #333333)",
  canceled: "linear-gradient(140deg, #b91c1c, #7f1d1d)",
  not_activated: "linear-gradient(140deg, #7b2fff, #5a1fd6)",
};

export function VirtualCard({ card, label, revealedPan, revealedCvc, children }: VirtualCardProps) {
  const gradient = STATUS_THEME[card.status] ?? STATUS_THEME.active;
  const panDisplay = cardNumberForDisplay(card.last4, revealedPan);
  const cvcDisplay = revealedCvc?.trim() ? revealedCvc : "•••";

  return (
    <article
      style={{
        position: "relative",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        width: "min(100%, 460px)",
        minHeight: 220,
        aspectRatio: "1.586 / 1",
        color: "white",
        background: gradient,
        boxShadow: "var(--shadow-md)",
        margin: "0 auto",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.18,
          backgroundColor: "black",
          mixBlendMode: "multiply",
          WebkitMaskImage: "url('/brand/card-pattern.svg')",
          WebkitMaskSize: "cover",
          maskImage: "url('/brand/card-pattern.svg')",
          maskSize: "cover",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.14,
          backgroundColor: "white",
          mixBlendMode: "screen",
          transform: "translate(-0.5px, -0.5px)",
          WebkitMaskImage: "url('/brand/card-pattern.svg')",
          WebkitMaskSize: "cover",
          maskImage: "url('/brand/card-pattern.svg')",
          maskSize: "cover",
        }}
      />

      <div style={{ position: "relative", height: "100%", padding: 18, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.78 }}>
            machines card
          </span>
          <span className={`status-pill status-${card.status}`} style={{ color: "white", background: "rgba(0,0,0,0.3)" }}>
            {card.status.replace("_", " ")}
          </span>
        </header>

        <div style={{ fontSize: 32, letterSpacing: "0.08em", fontFamily: "var(--font-mono)" }}>
          {panDisplay}
        </div>

        <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.75, textTransform: "uppercase", marginBottom: 4 }}>expires</div>
            <div style={{ fontSize: 14 }}>{String(card.expirationMonth).padStart(2, "0")}/{String(card.expirationYear).slice(-2)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, opacity: 0.75, textTransform: "uppercase", marginBottom: 4 }}>cvc</div>
            <div style={{ fontSize: 14, fontFamily: "var(--font-mono)" }}>{cvcDisplay}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, opacity: 0.75, textTransform: "uppercase", marginBottom: 4 }}>label</div>
            <div style={{ fontSize: 14 }}>{label ?? `card ${card.last4}`}</div>
          </div>
        </footer>
      </div>

      {children}
    </article>
  );
}

function normalizeCardNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return value;
  return digits.match(/.{1,4}/g)?.join(" ") ?? value;
}

function cardNumberForDisplay(last4: string, pan?: string) {
  if (pan?.trim()) {
    return normalizeCardNumber(pan);
  }
  return `•••• •••• •••• ${last4}`;
}
