import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { loadOpeningCatalog, searchOpeningCatalog, type CatalogOpening } from '../openings/catalog';
import type { Color } from '../chess/types';
import type { OpeningPack } from './packs';
import { databasePack } from './database';

export function OpeningDatabasePicker({ onChoose }: { onChoose: (pack: OpeningPack) => void }) {
  const [entries, setEntries] = useState<CatalogOpening[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<CatalogOpening | null>(null);
  const [side, setSide] = useState<Color>('w');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [choiceError, setChoiceError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError('');
    loadOpeningCatalog()
      .then((result) => {
        if (current) setEntries(result);
      })
      .catch((reason) => {
        if (current)
          setLoadError(reason instanceof Error ? reason.message : 'Opening database unavailable.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [retry]);
  const results = useMemo(() => searchOpeningCatalog(entries, query, page), [entries, query, page]);
  return (
    <section className="ot-database" aria-label="Opening database">
      <h3>
        <Search size={18} /> Search the opening database
      </h3>
      <label>
        Opening name, variation, or ECO
        <input
          type="search"
          value={query}
          placeholder="Sicilian Dragon, London, B90…"
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
            setSelected(null);
            setChoiceError('');
          }}
        />
      </label>
      {loading ? (
        <p role="status">Loading bundled opening lines…</p>
      ) : loadError ? (
        <div className="ot-feedback" role="alert">
          <p>{loadError}</p>
          <button className="ot-button" onClick={() => setRetry((value) => value + 1)}>
            Retry opening database
          </button>
        </div>
      ) : (
        <>
          <div className="ot-database-count">
            {results.total.toLocaleString()} named {results.total === 1 ? 'line' : 'lines'} · page{' '}
            {results.page + 1} of {results.pages}
          </div>
          <div className="ot-database-results">
            {results.items.map((entry) => (
              <button
                key={entry.id}
                className={selected?.id === entry.id ? 'is-selected' : ''}
                aria-pressed={selected?.id === entry.id}
                onClick={() => {
                  setSelected(entry);
                  setChoiceError('');
                }}
              >
                <span>{entry.eco}</span>
                <strong>{entry.name}</strong>
              </button>
            ))}
          </div>
          {!results.total && (
            <p className="ot-muted">No matching opening. Try a shorter name or an ECO code.</p>
          )}
          <div className="ot-navigation">
            <button
              className="ot-button"
              aria-label="Previous opening results"
              disabled={results.page === 0}
              onClick={() => setPage(results.page - 1)}
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <button
              className="ot-button"
              aria-label="Next opening results"
              disabled={results.page + 1 >= results.pages}
              onClick={() => setPage(results.page + 1)}
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
          {selected && (
            <div className="ot-database-selection">
              <strong>
                {selected.eco} · {selected.name}
              </strong>
              <p>{selected.pgn}</p>
              <label>
                Practice database line as
                <select
                  value={side}
                  onChange={(event) => {
                    setSide(event.target.value as Color);
                    setChoiceError('');
                  }}
                >
                  <option value="w">White</option>
                  <option value="b">Black</option>
                </select>
              </label>
              <p className="ot-muted">
                Learn this named line with a guided tour and recall drills. Curated repertoires
                below include multiple related variations and strategic notes.
              </p>
              {choiceError && (
                <p role="alert" className="ot-feedback">
                  {choiceError}
                </p>
              )}
              <button
                className="ot-primary"
                onClick={() => {
                  try {
                    onChoose(databasePack(selected, side));
                  } catch (reason) {
                    setChoiceError(
                      reason instanceof Error
                        ? reason.message
                        : 'This opening could not be started.',
                    );
                  }
                }}
              >
                Learn selected opening
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
