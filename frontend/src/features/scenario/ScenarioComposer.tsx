type Props = {
  decisions: string[];
  selected: string[];
  setSelected: (value: string[]) => void;
};

export function ScenarioComposer({ decisions, selected, setSelected }: Props) {
  function toggle(item: string) {
    setSelected(
      selected.includes(item)
        ? selected.filter((value) => value !== item)
        : [...selected, item],
    );
  }

  return (
    <section className="panel">
      <h2>AI style choices</h2>
      <p>Pick what the AI should keep or change for the demo.</p>
      <div className="choice-list">
        {decisions.map((item) => (
          <button
            key={item}
            type="button"
            className={selected.includes(item) ? 'choice choice-active' : 'choice'}
            onClick={() => toggle(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </section>
  );
}
