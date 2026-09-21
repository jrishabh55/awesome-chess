import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { searchOpeningCatalog, type CatalogOpening } from '../openings/catalog';
import './combobox.css';

interface Props {
  entries: CatalogOpening[];
  value: CatalogOpening | null;
  onChange: (opening: CatalogOpening | null) => void;
  disabled?: boolean;
  label?: string;
}
const openingLabel = (opening: CatalogOpening) => `${opening.eco} · ${opening.name}`;

export function OpeningCombobox({
  entries,
  value,
  onChange,
  disabled = false,
  label = 'Opening name, variation, or ECO',
}: Props) {
  const id = useId();
  const listId = `${id}-results`;
  const root = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const localClear = useRef(false);
  const [query, setQuery] = useState(() => (value ? openingLabel(value) : ''));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [placement, setPlacement] = useState({ above: false, maxHeight: 360 });
  // A selected display label includes punctuation that isn't part of the search index.
  const search = value && query === openingLabel(value) ? value.name : query;
  const results = useMemo(() => searchOpeningCatalog(entries, search, 0, 40), [entries, search]);
  const activeEntry = results.items[active];
  const expanded = open && !disabled;

  useEffect(() => {
    if (!value && localClear.current) {
      localClear.current = false;
      return;
    }
    localClear.current = false;
    setQuery(value ? openingLabel(value) : '');
    setActive(-1);
  }, [value?.id, value?.eco, value?.name]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [expanded]);

  useLayoutEffect(() => {
    if (!expanded || !anchor.current) return;
    const measure = () => {
      const bounds = anchor.current!.getBoundingClientRect();
      const dialog = anchor.current!.closest('dialog')?.getBoundingClientRect();
      const bottom = Math.min(window.innerHeight, dialog?.bottom ?? window.innerHeight) - 12;
      const top = Math.max(0, dialog?.top ?? 0) + 12;
      const below = bottom - bounds.bottom;
      const above = bounds.top - top;
      const upwards = below < 180 && above > below;
      const maxHeight = Math.max(70, Math.min(360, (upwards ? above : below) - 6));
      setPlacement((previous) =>
        previous.above === upwards && previous.maxHeight === maxHeight
          ? previous
          : { above: upwards, maxHeight },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(anchor.current);
    const dialog = anchor.current.closest('dialog');
    if (dialog) observer.observe(dialog);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [expanded]);

  useLayoutEffect(() => {
    if (!expanded || active < 0 || !list.current) return;
    const option = document.getElementById(`${id}-option-${active}`);
    if (!option) return;
    const container = list.current;
    const optionBounds = option.getBoundingClientRect();
    const listBounds = container.getBoundingClientRect();
    if (optionBounds.top < listBounds.top) container.scrollTop -= listBounds.top - optionBounds.top;
    else if (optionBounds.bottom > listBounds.bottom)
      container.scrollTop += optionBounds.bottom - listBounds.bottom;
  }, [expanded, active, id, results]);

  const show = () => {
    if (disabled) return;
    setOpen(true);
    const selected = results.items.findIndex((entry) => entry.id === value?.id);
    setActive(results.items.length ? Math.max(0, selected) : -1);
  };
  const choose = (opening: CatalogOpening) => {
    localClear.current = false;
    setQuery(openingLabel(opening));
    setOpen(false);
    setActive(-1);
    onChange(opening);
  };

  return (
    <div
      className="opening-combobox"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        // Once suggestions are closed, Escape belongs to the enclosing dialog.
        if (event.key === 'Escape' && !expanded) return;
        // Text editing and Tab keep their native behavior, without reaching board shortcuts.
        event.stopPropagation();
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
          setActive(-1);
        }
      }}
    >
      <label htmlFor={id} className="oc-label">
        {label}
      </label>
      <div className="oc-anchor" ref={anchor}>
        <div className={`oc-field${expanded ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`}>
          <Search className="oc-search-icon" size={16} aria-hidden="true" />
          <input
            id={id}
            ref={input}
            type="text"
            className="oc-input"
            role="combobox"
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={expanded ? listId : undefined}
            aria-activedescendant={expanded && activeEntry ? `${id}-option-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            value={query}
            placeholder="Sicilian Dragon, London, B90…"
            onFocus={show}
            onClick={() => {
              if (!expanded) show();
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setActive(0);
              if (value) {
                localClear.current = true;
                onChange(null);
              }
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setOpen(true);
                const count = results.items.length;
                setActive((previous) =>
                  !count
                    ? -1
                    : !expanded || previous < 0
                      ? event.key === 'ArrowDown'
                        ? 0
                        : count - 1
                      : Math.max(
                          0,
                          Math.min(count - 1, previous + (event.key === 'ArrowDown' ? 1 : -1)),
                        ),
                );
              } else if (event.key === 'Enter') {
                event.preventDefault();
                if (expanded && activeEntry) choose(activeEntry);
                else if (!expanded) show();
              }
            }}
          />
          {(query || value) && (
            <button
              type="button"
              className="oc-icon-button"
              aria-label="Clear opening"
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                input.current?.focus();
                setQuery('');
                setActive(0);
                setOpen(true);
                if (value) {
                  localClear.current = true;
                  onChange(null);
                }
              }}
            >
              <X size={15} />
            </button>
          )}
          <button
            type="button"
            className="oc-icon-button oc-toggle"
            aria-label={expanded ? 'Hide opening suggestions' : 'Show opening suggestions'}
            aria-expanded={expanded}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (expanded) setOpen(false);
              else {
                input.current?.focus();
                show();
              }
            }}
          >
            <ChevronDown size={17} />
          </button>
        </div>
        {expanded && (
          <div
            className={`oc-popover${placement.above ? ' is-above' : ''}`}
            style={{ maxHeight: placement.maxHeight }}
          >
            <div
              ref={list}
              id={listId}
              role="listbox"
              aria-label={`${label} suggestions`}
              className="oc-listbox"
              onMouseDown={(event) => event.preventDefault()}
            >
              {results.items.map((entry, index) => (
                <div
                  key={entry.id}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-label={openingLabel(entry)}
                  aria-selected={value?.id === entry.id}
                  className={`oc-option${active === index ? ' is-active' : ''}${value?.id === entry.id ? ' is-selected' : ''}`}
                  onMouseMove={() => setActive(index)}
                  onClick={() => choose(entry)}
                >
                  <span className="oc-eco">{entry.eco}</span>
                  <span className="oc-name">{entry.name}</span>
                  {value?.id === entry.id && <Check size={14} aria-hidden="true" />}
                </div>
              ))}
            </div>
            <div className="oc-result-status" role="status">
              {!results.total
                ? 'No matching openings. Try a shorter name or an ECO code.'
                : results.total > results.items.length
                  ? `Showing ${results.items.length} of ${results.total.toLocaleString()} openings. Refine your search.`
                  : `${results.total} ${results.total === 1 ? 'opening' : 'openings'} found`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
