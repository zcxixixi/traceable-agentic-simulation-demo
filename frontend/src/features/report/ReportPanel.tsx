type Props = {
  aiDecision: string;
  selected: string[];
};

export function ReportPanel({ aiDecision, selected }: Props) {
  return (
    <section className="panel">
      <h2>Result</h2>
      <p>{aiDecision}</p>
      <p className="muted">Chosen: {selected.join(', ')}</p>
    </section>
  );
}
