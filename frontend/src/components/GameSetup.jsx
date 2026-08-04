import React from 'react';
import FamilyTreeSelector from './FamilyTreeSelector';
import DateTimeField from './DateTimeField';

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
 * @param {String} gameType - 'standard' or 'tournament'
 * @param {Function} onGameTypeChange - Handler for game type change
 * @param {String} gameDate - Local wall-clock string for the game
 * @param {Function} onGameDateChange - Handler for date change
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
  gameType,
  onGameTypeChange,
  gameDate,
  onGameDateChange,
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
        <label>Game Type:</label>
        <select value={gameType} onChange={(e) => onGameTypeChange(e.target.value)}>
          <option value="standard">Standard game</option>
          <option value="tournament">Tournament</option>
        </select>
        {gameType === 'tournament' && (
          <p className="text-small">
            The winner of the last tournament of a year takes that year's place in
            the hall of fame.
          </p>
        )}
      </div>

      {/*
        Pre-filled with now, because that is right nearly every time. It is
        editable because the exception — entering a game played last weekend, or
        a tournament from a previous year — is exactly the case where the date
        carries meaning.
      */}
      <div className="form-group">
        <label>Date:</label>
        <DateTimeField value={gameDate} onChange={onGameDateChange} />
      </div>

      <div className="form-group">
        <label>Game Notes (optional):</label>
        <input
          type="text"
          placeholder="e.g., Midsummer rematch"
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
