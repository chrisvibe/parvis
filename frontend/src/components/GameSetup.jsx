import React from 'react';
import FamilyTreeSelector from './FamilyTreeSelector';

/**
 * GameSetup - Form for creating a new game.
 * 
 * Collects game settings and player selection before starting.
 * 
 * @param {Array} players - Available players
 * @param {Array} selectedPlayerIds - Currently selected player IDs
 * @param {Function} onPlayerSelectionChange - Handler for player selection
 * @param {Number} totalRounds - Number of rounds
 * @param {Function} onTotalRoundsChange - Handler for rounds change
 * @param {String} gameNotes - Game notes
 * @param {Function} onGameNotesChange - Handler for notes change
 * @param {String} gameLocation - Game location
 * @param {Function} onGameLocationChange - Handler for location change
 * @param {Function} onCreateGame - Handler for game creation
 */
function GameSetup({
  players,
  selectedPlayerIds,
  onPlayerSelectionChange,
  totalRounds,
  onTotalRoundsChange,
  gameNotes,
  onGameNotesChange,
  gameLocation,
  onGameLocationChange,
  onCreateGame,
}) {
  return (
    <div className="game-setup">
      <h2>New Game Setup</h2>
      
      <div className="form-group">
        <label>Total Rounds:</label>
        <input
          type="number"
          min="1"
          max="50"
          value={totalRounds}
          onChange={(e) => onTotalRoundsChange(parseInt(e.target.value))}
        />
      </div>

      <div className="form-group">
        <label>Game Notes (optional):</label>
        <input
          type="text"
          placeholder="e.g., Tournament 2025"
          value={gameNotes}
          onChange={(e) => onGameNotesChange(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label>Game Location (optional):</label>
        <input
          type="text"
          placeholder="e.g., Home, Office, Online"
          value={gameLocation}
          onChange={(e) => onGameLocationChange(e.target.value)}
        />
      </div>

      <FamilyTreeSelector
        players={players}
        selectedPlayerIds={selectedPlayerIds}
        onSelectionChange={onPlayerSelectionChange}
      />

      <button onClick={onCreateGame} disabled={selectedPlayerIds.length < 2}>
        Start Game ({selectedPlayerIds.length} players selected)
      </button>
    </div>
  );
}

export default GameSetup;
