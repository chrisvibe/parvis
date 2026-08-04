import React, { useState } from 'react';

/**
 * Pick several things from a long list: a filter box, a dropdown of what is
 * left, and a removable chip per choice.
 *
 * This block was written out twice, once for parent selection on the players
 * page and once for player selection on the statistics page, inline styles and
 * all — two copies of the same filtering rules that had already drifted apart
 * in what they searched and what they showed.
 *
 * @param {String} label - text above the control
 * @param {Array} items - [{ id, label, hint, searchText }]; hint is shown in the
 *        dropdown only, searchText defaults to label
 * @param {Array} selectedIds - currently chosen ids
 * @param {Function} onChange - called with the new id array
 * @param {String} searchPlaceholder - placeholder for the filter box
 * @param {String} addPlaceholder - the dropdown's first, non-selecting option
 * @param {String} selectionTitle - heading of the chip box
 * @param {String} emptyText - shown in the chip box when nothing is chosen
 * @param {Boolean} showMatchCount - append "(N matching)" to the label
 * @param {Number} visibleOptions - render the dropdown as a list box this tall;
 *        0 (the default) leaves it a plain dropdown
 */
function MultiSelect({
  label,
  items,
  selectedIds,
  onChange,
  searchPlaceholder = 'Filter by name...',
  addPlaceholder = '-- Select --',
  selectionTitle = 'Selected',
  emptyText = 'Nothing selected',
  showMatchCount = false,
  visibleOptions = 0,
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const term = searchTerm.trim().toLowerCase();
  const available = items.filter((item) => {
    if (selectedIds.includes(item.id)) return false;
    if (!term) return true;
    return (item.searchText ?? item.label).toLowerCase().includes(term);
  });

  const add = (id) => {
    if (!id || selectedIds.includes(id)) return;
    onChange([...selectedIds, id]);
    setSearchTerm('');   // the filter has done its job once something is chosen
  };

  const remove = (id) => onChange(selectedIds.filter((selected) => selected !== id));

  const selectProps = visibleOptions
    ? { size: Math.min(available.length + 1, visibleOptions) }
    : {};

  return (
    <div className="multi-select">
      {label && (
        <label>
          {label}
          {showMatchCount && ` (${available.length} matching)`}
        </label>
      )}

      <input
        type="text"
        className="search-input"
        placeholder={searchPlaceholder}
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
      />

      <select
        value=""
        onChange={(event) => add(parseInt(event.target.value, 10))}
        {...selectProps}
      >
        <option value="">{addPlaceholder}</option>
        {available.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}{item.hint ? ` (${item.hint})` : ''}
          </option>
        ))}
      </select>

      <div className="selection-box">
        <div className="title">
          {selectionTitle} ({selectedIds.length}):
        </div>

        {selectedIds.length === 0 ? (
          <div className="empty">{emptyText}</div>
        ) : (
          <div className="chip-list">
            {selectedIds.map((id) => {
              const item = items.find((candidate) => candidate.id === id);
              if (!item) return null;

              return (
                <div key={id} className="chip">
                  <span>{item.label}</span>
                  <button type="button" className="remove" onClick={() => remove(id)}>
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default MultiSelect;
