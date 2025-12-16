import React from 'react';
import GameMatrix from './GameMatrix';
import GameControls from './GameControls';
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
 * @param {Function} onEditMetadata - Handler for edit metadata
 * @param {Function} onCancelGame - Handler for cancel game
 * @param {Function} onFinishGame - Handler for finish game
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
  onCancelGame,
  onFinishGame,
}) {
  return (
    <div className="active-game">
      <div className="game-header">
        <h2>
          Game #{game.id} - Round {game.current_round}/{game.total_rounds}
        </h2>
        <GameControls
          onAdjustRounds={onAdjustRounds}
          onEditMetadata={onEditMetadata}
          onCancelGame={onCancelGame}
          onFinishGame={onFinishGame}
        />
      </div>

      <GameMatrix
        game={game}
        players={gameStats}
        rounds={rounds}
        onRoundsUpdate={onRoundUpdate}
        onReload={onReload}
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
