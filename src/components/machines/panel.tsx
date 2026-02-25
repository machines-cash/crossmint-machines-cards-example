"use client";

export function Panel(props: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="surface" style={{ padding: 16 }}>
      <div className="row-wrap" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <div className="stack" style={{ gap: 2 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{props.title}</h2>
          {props.subtitle ? <p className="muted" style={{ margin: 0, fontSize: 13 }}>{props.subtitle}</p> : null}
        </div>
        {props.actions}
      </div>
      {props.children}
    </section>
  );
}
