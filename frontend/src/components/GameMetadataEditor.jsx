import React, { useState } from 'react';
import DateTimeField from './DateTimeField';
import { toLocalInputValue } from '../utils/datetime';

/**
 * Edit what a game *is*, after the fact: its type, when it was played, and the
 * free text around it.
 *
 * This replaced a chain of `window.prompt()` calls. A prompt can carry a string;
 * it cannot carry a date the browser will validate or a choice between two
 * types, and it gives no way to change one field without being asked about the
 * others. Correcting a tournament's year — the reason this needs to be editable
 * at all — was the case prompts served worst.
 *
 * @param {Object} game - the game being edited
 * @param {Function} onSave - receives {game_type, date, notes, location}
 * @param {Function} onCancel - dismiss without saving
 */
function GameMetadataEditor({ game, onSave, onCancel }) {
  const [gameType, setGameType] = useState(game.game_type || 'standard');
  const [date, setDate] = useState(toLocalInputValue(game.date));
  const [notes, setNotes] = useState(game.notes || '');
  const [location, setLocation] = useState(game.location || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({ game_type: gameType, date, notes, location });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      {/* The click that dismisses belongs to the backdrop, not to the form. */}
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>EDIT GAME #{game.id}</h2>
          <button type="button" className="modal-close" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Game Type:</label>
            <select value={gameType} onChange={(e) => setGameType(e.target.value)}>
              <option value="standard">Standard game</option>
              <option value="tournament">Tournament</option>
            </select>
          </div>

          <div className="form-group">
            <label>Date:</label>
            <DateTimeField value={date} onChange={setDate} />
            {gameType === 'tournament' && (
              <p className="text-small">
                The year of this date is the year this tournament counts for.
              </p>
            )}
          </div>

          <div className="form-group">
            <label>Notes:</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="form-group">
            <label>Location:</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>

          <div className="button-row tight">
            <button type="submit" disabled={saving}>
              {saving ? 'SAVING...' : '💾 SAVE'}
            </button>
            <button type="button" className="button" onClick={onCancel}>
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default GameMetadataEditor;
