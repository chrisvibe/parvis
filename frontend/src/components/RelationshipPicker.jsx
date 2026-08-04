import React, { useState } from 'react';
import { formatDate } from '../utils/datetime';

/**
 * Relate this player to another one: pick who, and pick how.
 *
 * This replaces a "parents" list, which could only ever express one of the
 * three things people actually want to say. "Parent" alone also forced the
 * relationship to be entered from one particular end — to record a child you
 * had to go and edit the child.
 *
 * The three relationships are not three stores. "X is my child" is the same
 * fact as "I am X's parent", so it goes in the same place, entered from the
 * other side; only partnership is genuinely separate, and it is symmetric.
 */

export const RELATIONSHIPS = [
  { value: 'partner', label: 'Partner', field: 'partner_ids', note: 'drawn beside this player' },
  { value: 'parent', label: 'Parent', field: 'parent_ids', note: 'drawn above this player' },
  { value: 'child', label: 'Child', field: 'child_ids', note: 'drawn below this player' },
];

const FIELD_BY_VALUE = Object.fromEntries(RELATIONSHIPS.map((r) => [r.value, r.field]));
const LABEL_BY_FIELD = Object.fromEntries(RELATIONSHIPS.map((r) => [r.field, r.label]));

// Below this many players the whole roster fits in the dropdown, and a filter
// box is a control that costs a glance and saves nothing. It comes back on its
// own when the family outgrows the list.
const FILTER_THRESHOLD = 15;

/**
 * @param {Array} players - everyone who could be related to
 * @param {Object} value - { parent_ids, child_ids, partner_ids }
 * @param {Function} onChange - called with the new value object
 * @param {Number} excludeId - the player being edited, who cannot be related to
 *        themselves
 */
function RelationshipPicker({ players, value, onChange, excludeId = null }) {
  const [relationship, setRelationship] = useState(RELATIONSHIPS[0].value);
  const [searchTerm, setSearchTerm] = useState('');

  const showFilter = players.length > FILTER_THRESHOLD;
  // Only filter by something the user can see and clear. Otherwise a term typed
  // while the roster was large would go on hiding people after it shrank, with
  // no visible box to explain why.
  const term = showFilter ? searchTerm.trim().toLowerCase() : '';

  // Someone already related in any way is not offered again: a second
  // relationship to the same person is always a contradiction, and the server
  // refuses it — better not to offer it than to explain the refusal.
  const alreadyRelated = new Set([
    ...(value.parent_ids || []),
    ...(value.child_ids || []),
    ...(value.partner_ids || []),
  ]);

  const available = players.filter((player) => {
    if (player.id === excludeId || alreadyRelated.has(player.id)) return false;
    if (!term) return true;
    return [player.alias, player.first_name, player.last_name]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(term));
  });

  const add = (playerId) => {
    if (!playerId) return;
    const field = FIELD_BY_VALUE[relationship];
    onChange({ ...value, [field]: [...(value[field] || []), playerId] });
    setSearchTerm('');
  };

  const remove = (field, playerId) => {
    onChange({ ...value, [field]: (value[field] || []).filter((id) => id !== playerId) });
  };

  const chips = RELATIONSHIPS.flatMap(({ field }) =>
    (value[field] || []).map((id) => ({ field, id }))
  );

  const active = RELATIONSHIPS.find((r) => r.value === relationship);

  return (
    <div className="multi-select">
      <label>RELATIONSHIPS (OPTIONAL)</label>
      <div className="field-hint">
        Not required — a player with no relationships stands alone in the tree,
        and relationships can be added later with EDIT.
      </div>

      {/*
        Three buttons rather than a dropdown: which relationship you are about
        to add is the one thing here you can get wrong without noticing, so it
        should be readable without opening anything.
      */}
      <div className="segmented" role="group" aria-label="Relationship">
        {RELATIONSHIPS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === relationship ? 'active' : ''}
            aria-pressed={option.value === relationship}
            onClick={() => setRelationship(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="field-hint">{active.note}</div>

      {/*
        The filter sits directly above the list it filters. It used to sit
        beside the relationship dropdown, which is the one control it has no
        effect on.
      */}
      {showFilter && (
        <input
          type="text"
          className="search-input"
          placeholder="Filter by name..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      )}

      <select value="" onChange={(event) => add(parseInt(event.target.value, 10))}>
        <option value="">{`-- Add a ${active.label.toLowerCase()} --`}</option>
        {available.map((player) => (
          <option key={player.id} value={player.id}>
            {player.alias}
            {player.birthdate && ` (${formatDate(player.birthdate)})`}
          </option>
        ))}
      </select>

      <div className="selection-box">
        <div className="title">Related players ({chips.length}):</div>

        {chips.length === 0 ? (
          <div className="empty">
            No relationships — that's fine, this field is optional
          </div>
        ) : (
          <div className="chip-list">
            {chips.map(({ field, id }) => {
              const player = players.find((candidate) => candidate.id === id);
              if (!player) return null;

              return (
                <div key={`${field}-${id}`} className="chip">
                  <span>
                    {player.alias}
                    <span className="text-small"> — {LABEL_BY_FIELD[field].toLowerCase()}</span>
                  </span>
                  <button type="button" className="remove" onClick={() => remove(field, id)}>
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

export default RelationshipPicker;
