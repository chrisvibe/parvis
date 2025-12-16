import React from 'react';

/**
 * GameControls - Action buttons for active game.
 * 
 * Provides buttons for adjusting rounds, editing metadata,
 * cancelling, and finishing the game.
 * 
 * @param {Function} onAdjustRounds - Handler for adjust rounds
 * @param {Function} onEditMetadata - Handler for edit metadata
 * @param {Function} onCancelGame - Handler for cancel game
 * @param {Function} onFinishGame - Handler for finish game
 */
function GameControls({ 
  onAdjustRounds, 
  onEditMetadata, 
  onCancelGame, 
  onFinishGame 
}) {
  return (
    <div className="game-controls">
      <button onClick={onAdjustRounds} className="button">
        ⚙️ Adjust Rounds
      </button>
      <button onClick={onEditMetadata} className="button">
        📝 Edit Metadata
      </button>
      <button onClick={onCancelGame} className="button danger">
        ❌ Cancel Game
      </button>
      <button onClick={onFinishGame} className="button success">
        🏁 Finish Game
      </button>
    </div>
  );
}

export default GameControls;
