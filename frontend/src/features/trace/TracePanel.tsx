type Props = {
  aiDecision: string;
  selected: string[];
};

export function TracePanel({ aiDecision, selected }: Props) {
  return (
    <section className="panel">
      <h2>Trace</h2>
      <p>{aiDecision}</p>
      <p className="muted">Checked options: {selected.length}</p>
    </section>
  );
}
