type Props = {
  aiDecision: string;
  selected: string[];
};

export function WorldCanvas({ aiDecision, selected }: Props) {
  return (
    <section className="panel panel-wide">
      <h2>AI decision mock</h2>
      <p>{aiDecision}</p>
      <div className="world-card">
        <div className="world-label">Kept</div>
        <ul>
          {selected.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
