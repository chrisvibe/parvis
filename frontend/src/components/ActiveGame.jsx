import React, { useState } from 'react';
import GameMatrix from './GameMatrix';
import GameControls from './GameControls';
import GameMetadataEditor from './GameMetadataEditor';
import ImportWarnings from './ImportWarnings';
import ScoreChart from './ScoreChart';
import Leaderboard from './Leaderboard';

/**
 * ActiveGame - Displays an active game in progress.
 * 
 * Orchestrates the game matrix, controls, chart, and leaderboard.
 * 
 * @param {Object} game - Active game object
 * @param {Array} gameStats - Player statistics
 * @param {Array} rounds - Round data
 * @param {Array} chartData - Chart visualization data
 * @param {Function} onRoundUpdate - Handler for round updates
 * @param {Function} onReload - Handler to reload game data
 * @param {Function} onAdjustRounds - Handler for adjust rounds
 * @param {Function} onEditMetadata - Save handler, receives the edited metadata
 * @param {Function} onMinimizeGame - Handler for minimize game
 * @param {Function} onDeleteGame - Handler for delete game
 * @param {Function} onFinishGame - Handler for finish game
 * @param {Function} onReorderPlayers - Receives the player ids in their new
 *        seating order
 * @param {Function} onEvictPlayer - Takes a player out of the game as though
 *        they had never been in it. Receives their id and alias, and asks
 *        before doing anything.
 * @param {Function} onAcknowledgeImport - Clears the warnings a transcribed
 *        game arrived with, once somebody has checked it against the paper.
 */
function ActiveGame({
  game,
  gameStats,
  rounds,
  chartData,
  onRoundUpdate,
  onReload,
  onAdjustRounds,
  onEditMetadata,
  onMinimizeGame,
  onDeleteGame,
  onFinishGame,
  onReorderPlayers,
  onEvictPlayer,
  onAcknowledgeImport,
}) {
  const [editingMetadata, setEditingMetadata] = useState(false);

  const handleSaveMetadata = async (values) => {
    await onEditMetadata(values);
    setEditingMetadata(false);
  };

  return (
    <div className="active-game">
      <div className="game-header">
        <h2>
          Game #{game.id} - Round {game.current_round}/{game.total_rounds}
          {game.game_type === 'tournament' && <span className="badge">TOURNAMENT</span>}
        </h2>
        <GameControls
          game={game}
          onAdjustRounds={onAdjustRounds}
          onEditMetadata={() => setEditingMetadata(true)}
          onMinimizeGame={onMinimizeGame}
          onDeleteGame={onDeleteGame}
        />
      </div>

      {editingMetadata && (
        <GameMetadataEditor
          game={game}
          onSave={handleSaveMetadata}
          onCancel={() => setEditingMetadata(false)}
        />
      )}

      <ImportWarnings
        warnings={game.import_warnings}
        onAcknowledge={onAcknowledgeImport}
      />

      <GameMatrix
        game={game}
        players={gameStats}
        rounds={rounds}
        onRoundsUpdate={onRoundUpdate}
        onReload={onReload}
        onFinishGame={onFinishGame}
        onReorderPlayers={onReorderPlayers}
        onEvictPlayer={onEvictPlayer}
      />

      <ScoreChart
        chartData={chartData}
        gameStats={gameStats}
      />

      <Leaderboard gameStats={gameStats} />
    </div>
  );
}

export default ActiveGame;
