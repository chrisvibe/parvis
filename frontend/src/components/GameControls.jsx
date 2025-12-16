import React from 'react';

/**
 * GameControls - Action buttons for active game.
 * 
 * Provides buttons for adjusting rounds, editing metadata,
 * minimizing, and deleting the game.
 * 
 * @param {Object} game - Current game object (needed to check if on last round)
 * @param {Function} onAdjustRounds - Handler for adjust rounds
 * @param {Function} onEditMetadata - Handler for edit metadata
 * @param {Function} onMinimizeGame - Handler for minimize game
 * @param {Function} onDeleteGame - Handler for delete game
 */
function GameControls({ 
  game,
  onAdjustRounds, 
  onEditMetadata, 
  onMinimizeGame,
  onDeleteGame
}) {
  return (
    <div className="game-controls">
      <button onClick={onAdjustRounds} className="button">
        ⚙️ Adjust Rounds
      </button>
      <button onClick={onEditMetadata} className="button">
        📝 Edit Metadata
      </button>
      <button onClick={onMinimizeGame} className="button">
        ➖ Minimize
      </button>
      <button onClick={onDeleteGame} className="button danger">
        🗑️ Delete
      </button>
    </div>
  );
}

export default GameControls;
