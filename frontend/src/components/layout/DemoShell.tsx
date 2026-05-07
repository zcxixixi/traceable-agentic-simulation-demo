import type { ReactNode } from 'react';

export function DemoShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Traceable Agentic Simulation</p>
          <h1>AI Town-style decision demo</h1>
        </div>
        <div className="status-pill">Prototype scaffold</div>
      </header>
      <main className="grid">{children}</main>
    </div>
  );
}
