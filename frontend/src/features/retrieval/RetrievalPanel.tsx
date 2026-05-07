import type { RetrievalResult } from '../../lib/demoSchema';

export function RetrievalPanel({ results }: { results: RetrievalResult[] }) {
  return (
    <section className="panel retrieval-panel">
      <h2>Retrieval</h2>
      <div className="retrieval-list">
        {results.map((result) => (
          <article key={result.id} className="retrieval-card">
            <div>
              <strong>{result.id}</strong>
              <span>{result.kind}</span>
            </div>
            <p>{result.text}</p>
            <small>score {result.score.toFixed(2)}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
