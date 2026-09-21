import { useEffect, useId, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { Color } from '../chess/types';
import { loadOpeningCatalog, type CatalogOpening } from '../openings/catalog';
import { openingFamilies, familyName } from '../openings/families';
import { OpeningCombobox } from './OpeningCombobox';
import { importPack, type OpeningPack } from './packs';
import { CourseBrowser } from './CourseBrowser';
import type { OpeningCourse } from './courses';
import { databasePack } from './database';
import {
  addRepertoireOpening,
  createRepertoire,
  loadRepertoires,
  removeRepertoireOpening,
  RepertoireConflictError,
  renameRepertoire,
  repertoirePack,
  saveRepertoires,
  type Repertoire,
} from './repertoires';
import './library.css';

const sideName = (side: Color) => (side === 'w' ? 'White' : 'Black');
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'This action could not be completed.';
type LibraryTab = 'browse' | 'repertoires' | 'courses' | 'import';
const tabs: { id: LibraryTab; name: string }[] = [
  { id: 'browse', name: 'Courses' },
  { id: 'repertoires', name: 'My repertoires' },
  { id: 'courses', name: 'Single lines' },
  { id: 'import', name: 'Import PGN' },
];

export function OpeningLibrary({
  onChoose,
  onChooseCourse,
}: {
  onChoose: (pack: OpeningPack) => void;
  onChooseCourse: (course: OpeningCourse) => void;
}) {
  const uid = useId();
  const [tab, setTab] = useState<LibraryTab>('browse');
  const [entries, setEntries] = useState<CatalogOpening[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [familyId, setFamilyId] = useState('');
  const [familyPage, setFamilyPage] = useState(0);
  const [selected, setSelected] = useState<CatalogOpening | null>(null);
  const [practiceSide, setPracticeSide] = useState<Color>('w');
  const [initialLibrary] = useState(() => {
    try {
      return { items: loadRepertoires(), error: '' };
    } catch (error) {
      return { items: [] as Repertoire[], error: message(error) };
    }
  });
  const [repertoires, setRepertoires] = useState(initialLibrary.items);
  const [storageError, setStorageError] = useState(initialLibrary.error);
  const [selectedRepertoire, setSelectedRepertoire] = useState('');
  const [targetId, setTargetId] = useState('new');
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftSide, setDraftSide] = useState<Color>('w');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pgn, setPgn] = useState('');
  const [importName, setImportName] = useState('My repertoire');
  const [importSide, setImportSide] = useState<Color>('w');
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError('');
    loadOpeningCatalog()
      .then((data) => {
        if (alive) setEntries(data);
      })
      .catch((error) => {
        if (alive) setLoadError(message(error));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [retry]);
  const families = useMemo(() => openingFamilies(entries), [entries]);
  const family = families.find((item) => item.id === familyId);
  const familyPages = Math.max(1, Math.ceil((family?.openings.length || 0) / 6));
  const repertoire = repertoires.find((item) => item.id === selectedRepertoire);
  const repertoireFamilies = useMemo(
    () => openingFamilies(repertoire?.openings || []),
    [repertoire],
  );
  const changeTab = (next: LibraryTab) => {
    setTab(next);
    setError('');
    setNotice('');
    setAdding(false);
    setCreating(false);
    setRenaming(false);
    setConfirmDelete(false);
  };
  function perform(action: () => void) {
    setError('');
    setNotice('');
    try {
      action();
    } catch (reason) {
      if (reason instanceof RepertoireConflictError) setStorageError(message(reason));
      else setError(message(reason));
    }
  }
  function persist(items: Repertoire[]) {
    saveRepertoires(items, repertoires);
    setRepertoires(items);
    setStorageError('');
  }
  function chooseOpening(opening: CatalogOpening | null) {
    setSelected(opening);
    setAdding(false);
    setError('');
    setNotice('');
    if (opening) {
      const group = families.find((item) => item.name === familyName(opening));
      setFamilyId(group?.id || '');
      const index = group?.openings.findIndex((item) => item.id === opening.id) || 0;
      setFamilyPage(Math.floor(Math.max(0, index) / 6));
    }
  }
  function addSelected() {
    if (!selected) return;
    perform(() => {
      const existing =
        targetId === 'new' ? undefined : repertoires.find((item) => item.id === targetId);
      if (targetId !== 'new' && !existing)
        throw Error('Choose a saved repertoire or create a new one.');
      const before = existing || createRepertoire(draftName, draftSide);
      const updated = addRepertoireOpening(before, selected);
      persist(
        existing
          ? repertoires.map((item) => (item.id === updated.id ? updated : item))
          : [...repertoires, updated],
      );
      setSelectedRepertoire(updated.id);
      setTargetId(updated.id);
      setAdding(false);
      setNotice(
        updated.openings.length === before.openings.length
          ? `This variation is already in ${updated.name}.`
          : `Added to ${updated.name}.`,
      );
    });
  }
  const repertoireFields = (
    <div className="ol-form-row">
      <label>
        Repertoire name
        <input
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          maxLength={80}
          required
          autoComplete="off"
        />
      </label>
      <label>
        Repertoire side
        <select value={draftSide} onChange={(event) => setDraftSide(event.target.value as Color)}>
          <option value="w">White</option>
          <option value="b">Black</option>
        </select>
      </label>
    </div>
  );
  return (
    <div className="opening-library">
      <div className="ol-tabs" role="tablist" aria-label="Opening library">
        {tabs.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${uid}-${item.id}`}
            aria-controls={`${uid}-panel`}
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => changeTab(item.id)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              event.stopPropagation();
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? tabs.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
              changeTab(tabs[next].id);
              document.getElementById(`${uid}-${tabs[next].id}`)?.focus();
            }}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div
        className="ol-content"
        id={`${uid}-panel`}
        role="tabpanel"
        aria-labelledby={`${uid}-${tab}`}
      >
        {storageError && (
          <div className="ol-error" role="alert">
            <p>{storageError}</p>
            <button
              className="ot-button"
              onClick={() => {
                try {
                  setRepertoires(loadRepertoires());
                  setStorageError('');
                  setError('');
                } catch (reason) {
                  setStorageError(message(reason));
                }
              }}
            >
              Retry saved repertoires
            </button>
          </div>
        )}
        {error && (
          <p className="ol-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <div className="ol-notice" role="status">
            <Check size={15} />
            <span>{notice}</span>
            {tab === 'courses' && (
              <button onClick={() => changeTab('repertoires')}>View repertoire</button>
            )}
          </div>
        )}
        {tab === 'browse' &&
          (loading ? (
            <p className="ot-muted" role="status">
              Preparing opening courses…
            </p>
          ) : loadError ? (
            <div className="ol-error" role="alert">
              <p>{loadError}</p>
              <button className="ot-button" onClick={() => setRetry((value) => value + 1)}>
                Retry opening database
              </button>
            </div>
          ) : (
            <CourseBrowser
              entries={entries}
              onChoose={onChooseCourse}
              onChoosePack={(pack) => perform(() => onChoose(pack))}
            />
          ))}
        {tab === 'courses' && (
          <>
            <OpeningCombobox
              entries={entries}
              value={selected}
              onChange={chooseOpening}
              disabled={loading || !!loadError}
            />
            {loading ? (
              <p className="ot-muted" role="status">
                Loading bundled opening lines…
              </p>
            ) : loadError ? (
              <div className="ol-error" role="alert">
                <p>{loadError}</p>
                <button className="ot-button" onClick={() => setRetry((value) => value + 1)}>
                  Retry opening database
                </button>
              </div>
            ) : (
              <>
                <label className="ol-family-filter">
                  Browse opening families
                  <select
                    aria-label="Opening family"
                    value={familyId}
                    onChange={(event) => {
                      setFamilyId(event.target.value);
                      setFamilyPage(0);
                      setSelected(null);
                      setAdding(false);
                      setNotice('');
                    }}
                  >
                    <option value="">All families · {families.length}</option>
                    {families.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.openings.length})
                      </option>
                    ))}
                  </select>
                </label>
                {selected && (
                  <section className="ol-selected" aria-label="Selected variation">
                    <div>
                      <span className="ol-eco">{selected.eco}</span>
                      <strong>{selected.name}</strong>
                    </div>
                    <details>
                      <summary>View move sequence</summary>
                      <p className="ol-moves">{selected.pgn}</p>
                    </details>
                    <div className="ol-form-row ol-practice-row">
                      <label>
                        Practice database line as
                        <select
                          value={practiceSide}
                          onChange={(event) => setPracticeSide(event.target.value as Color)}
                        >
                          <option value="w">White</option>
                          <option value="b">Black</option>
                        </select>
                      </label>
                      <button
                        className="ot-primary"
                        onClick={() =>
                          perform(() => onChoose(databasePack(selected, practiceSide)))
                        }
                      >
                        Learn selected opening
                      </button>
                      <button
                        className="ot-button"
                        disabled={!!storageError}
                        onClick={() => {
                          setAdding(!adding);
                          setDraftName(`${familyName(selected)} repertoire`.slice(0, 80));
                          setDraftSide(practiceSide);
                          setTargetId(
                            repertoires.some((item) => item.id === targetId)
                              ? targetId
                              : repertoires[0]?.id || 'new',
                          );
                        }}
                      >
                        {' '}
                        <Plus size={16} /> Add to repertoire
                      </button>
                    </div>
                    {adding && (
                      <form
                        className="ol-add-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          addSelected();
                        }}
                      >
                        <label>
                          Add this variation to
                          <select
                            aria-label="Destination repertoire"
                            value={targetId}
                            onChange={(event) => setTargetId(event.target.value)}
                          >
                            <option value="new">New repertoire…</option>
                            {repertoires.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} · {sideName(item.side)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {targetId === 'new' && repertoireFields}
                        <div className="ol-button-row">
                          <button type="submit" className="ot-primary">
                            Save variation
                          </button>
                          <button
                            type="button"
                            className="ot-button"
                            onClick={() => setAdding(false)}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </section>
                )}
                {family ? (
                  <section className="ol-family" aria-label="Family variations">
                    <div className="ol-section-heading">
                      <h3>{family.name}</h3>
                      <span>{family.openings.length} variations</span>
                    </div>
                    <div className="ol-variation-list">
                      {family.openings.slice(familyPage * 6, (familyPage + 1) * 6).map((item) => (
                        <button
                          key={item.id}
                          className={selected?.id === item.id ? 'selected' : ''}
                          aria-pressed={selected?.id === item.id}
                          onClick={() => chooseOpening(item)}
                        >
                          <span className="ol-eco">{item.eco}</span>
                          <span>{item.name.replace(`${family.name}: `, '')}</span>
                        </button>
                      ))}
                    </div>
                    {familyPages > 1 && (
                      <div className="ol-pagination">
                        <button
                          aria-label="Previous family variations"
                          disabled={familyPage === 0}
                          onClick={() => setFamilyPage((value) => value - 1)}
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <span>
                          Page {familyPage + 1} of {familyPages}
                        </span>
                        <button
                          aria-label="Next family variations"
                          disabled={familyPage + 1 === familyPages}
                          onClick={() => setFamilyPage((value) => value + 1)}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    )}
                  </section>
                ) : (
                  <div className="ol-empty">
                    <BookOpen size={24} />
                    <p>Find a variation above, or choose an opening family to browse its lines.</p>
                    <small>
                      Add the lines you want to play to your own White or Black repertoire.
                    </small>
                  </div>
                )}
              </>
            )}
          </>
        )}
        {tab === 'repertoires' && (
          <>
            {repertoire ? (
              <>
                <button
                  className="ol-back"
                  onClick={() => {
                    setSelectedRepertoire('');
                    setRenaming(false);
                    setConfirmDelete(false);
                  }}
                >
                  <ArrowLeft size={15} /> All repertoires
                </button>
                <div className="ol-section-heading">
                  <div>
                    <h3>{repertoire.name}</h3>
                    <p className="ot-muted">
                      Play {sideName(repertoire.side)} · {repertoire.openings.length} variations ·{' '}
                      {repertoireFamilies.length} families
                    </p>
                  </div>
                  <button
                    className="ot-icon"
                    title="Rename repertoire"
                    aria-label="Rename repertoire"
                    onClick={() => {
                      setRenameValue(repertoire.name);
                      setRenaming(!renaming);
                      setConfirmDelete(false);
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="ot-icon"
                    title="Delete repertoire"
                    aria-label="Delete repertoire"
                    onClick={() => {
                      setConfirmDelete(!confirmDelete);
                      setRenaming(false);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {renaming && (
                  <form
                    className="ol-inline-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      perform(() => {
                        const updated = renameRepertoire(repertoire, renameValue);
                        persist(
                          repertoires.map((item) => (item.id === updated.id ? updated : item)),
                        );
                        setRenaming(false);
                      });
                    }}
                  >
                    <label>
                      New repertoire name
                      <input
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        maxLength={80}
                        required
                      />
                    </label>
                    <button className="ot-primary" type="submit">
                      Save name
                    </button>
                  </form>
                )}
                {confirmDelete && (
                  <div className="ol-delete">
                    <p>Delete {repertoire.name} from your saved repertoires?</p>
                    <div className="ol-button-row">
                      <button className="ot-button" onClick={() => setConfirmDelete(false)}>
                        Keep repertoire
                      </button>
                      <button
                        className="ot-button"
                        onClick={() =>
                          perform(() => {
                            persist(repertoires.filter((item) => item.id !== repertoire.id));
                            setSelectedRepertoire('');
                            setConfirmDelete(false);
                          })
                        }
                      >
                        Confirm deletion
                      </button>
                    </div>
                  </div>
                )}
                <div className="ol-button-row">
                  <button
                    className="ot-primary"
                    disabled={!repertoire.openings.length}
                    onClick={() => perform(() => onChoose(repertoirePack(repertoire)))}
                  >
                    Practice repertoire
                  </button>
                  <button
                    className="ot-button"
                    disabled={!!storageError}
                    onClick={() => {
                      setTargetId(repertoire.id);
                      changeTab('courses');
                    }}
                  >
                    <Plus size={16} /> Add variations
                  </button>
                </div>
                {!repertoire.openings.length && (
                  <p className="ot-muted">
                    Add an opening variation to start building this repertoire.
                  </p>
                )}
                {repertoireFamilies.map((group) => (
                  <section className="ol-repertoire-family" key={group.id}>
                    <h4>
                      {group.name}
                      <span>{group.openings.length}</span>
                    </h4>
                    {group.openings.map((opening) => (
                      <div className="ol-saved-variation" key={opening.id}>
                        <span className="ol-eco">{opening.eco}</span>
                        <span>{opening.name.replace(`${group.name}: `, '')}</span>
                        <button
                          className="ot-icon"
                          aria-label={`Remove ${opening.name}`}
                          title="Remove variation"
                          disabled={!!storageError}
                          onClick={() =>
                            perform(() => {
                              const updated = removeRepertoireOpening(repertoire, opening.id);
                              persist(
                                repertoires.map((item) =>
                                  item.id === updated.id ? updated : item,
                                ),
                              );
                            })
                          }
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </section>
                ))}
              </>
            ) : (
              <>
                <div className="ol-section-heading">
                  <h3>My repertoires</h3>
                  <button
                    className="ot-button"
                    disabled={!!storageError}
                    onClick={() => {
                      setCreating(!creating);
                      setDraftName('');
                      setDraftSide('w');
                    }}
                  >
                    <Plus size={16} /> New repertoire
                  </button>
                </div>
                {creating && (
                  <form
                    className="ol-add-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      perform(() => {
                        const next = createRepertoire(draftName, draftSide);
                        persist([...repertoires, next]);
                        setSelectedRepertoire(next.id);
                        setTargetId(next.id);
                        setCreating(false);
                      });
                    }}
                  >
                    {repertoireFields}
                    <button className="ot-primary" type="submit">
                      Create repertoire
                    </button>
                  </form>
                )}
                {!repertoires.length && !creating && (
                  <div className="ol-empty">
                    <BookOpen size={24} />
                    <p>Your opening choices, saved together.</p>
                    <small>
                      Create a repertoire for White or Black, then add variations from the database.
                    </small>
                    <button className="ot-button" onClick={() => changeTab('courses')}>
                      Browse opening families
                    </button>
                  </div>
                )}
                <div className="ol-repertoire-list">
                  {repertoires.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setSelectedRepertoire(item.id);
                        setTargetId(item.id);
                        setConfirmDelete(false);
                        setRenaming(false);
                      }}
                    >
                      <BookOpen size={18} />
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {sideName(item.side)} · {item.openings.length} variations
                        </small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {tab === 'import' && (
          <form
            className="ot-import ol-import"
            onSubmit={(event) => {
              event.preventDefault();
              perform(() => onChoose(importPack(pgn, importSide, importName)));
            }}
          >
            <h3>Practice a PGN repertoire</h3>
            <p className="ot-muted">
              Paste variations and optional comments. Each complete branch becomes a lesson. Up to
              40 lines, 120 half-moves per line.
            </p>
            <label>
              Repertoire name
              <input
                value={importName}
                maxLength={80}
                onChange={(event) => setImportName(event.target.value)}
              />
            </label>
            <label>
              Train as
              <select
                value={importSide}
                onChange={(event) => setImportSide(event.target.value as Color)}
              >
                <option value="w">White</option>
                <option value="b">Black</option>
              </select>
            </label>
            <label>
              PGN variations
              <textarea
                value={pgn}
                onChange={(event) => setPgn(event.target.value)}
                placeholder="1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *"
                rows={5}
                required
                spellCheck={false}
              />
            </label>
            <button className="ot-primary" type="submit">
              Import and start
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
