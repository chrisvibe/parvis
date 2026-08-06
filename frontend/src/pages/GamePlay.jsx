import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGameState, useGameActions, useChartData } from '../hooks';
import { getSetting } from '../utils/settings';
import { toLocalInputValue, fromLocalInputValue } from '../utils/datetime';
import GameSetup from '../components/GameSetup';
import ActiveGame from '../components/ActiveGame';

/**
 * GamePlay - Main game page.
 * 
 * Orchestrates game setup and active game display.
 * Uses custom hooks for state and actions, delegates rendering to components.
 */
function GamePlay() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Game state and actions from custom hooks
  const {
    players,
    activeGame,
    rounds,
    gameStats,
    loading,
    loadGameData,
    clearGame,
    setGameStats,
  } = useGameState(location);

  const {
    createGame: createGameAction,
    updateRound,
    finishGame,
    minimizeGame,
    deleteGame,
    adjustRounds,
    editMetadata,
    reorderPlayers,
    evictPlayer,
    acknowledgeImport,
  } = useGameActions(activeGame, loadGameData, clearGame, navigate, setGameStats);

  const chartData = useChartData(gameStats, rounds, activeGame);
  
  // New game form state
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [totalRounds, setTotalRounds] = useState(getSetting('game.default_rounds', 10));
  const [gameType, setGameType] = useState('standard');
  const [gameDate, setGameDate] = useState(() => toLocalInputValue());
  const [gameNotes, setGameNotes] = useState('');
  const [gameLocation, setGameLocation] = useState('');

  // Create game handler
  const handleCreateGame = async () => {
    if (selectedPlayers.length < 2) {
      alert('Select at least 2 players');
      return;
    }

    try {
      await createGameAction({
        player_ids: selectedPlayers,
        total_rounds: parseInt(totalRounds),
        game_type: gameType,
        // Null lets the backend stamp its own now, which is the honest thing to
        // record if the field was somehow cleared.
        date: fromLocalInputValue(gameDate),
        notes: gameNotes || null,
        location: gameLocation || null,
      });

      // Reset form
      setSelectedPlayers([]);
      setGameType('standard');
      setGameDate(toLocalInputValue());
      setGameNotes('');
      setGameLocation('');
    } catch (error) {
      alert('Error creating game');
    }
  };

  if (loading) {
    return <div className="page"><h1>Loading...</h1></div>;
  }

  return (
    <div className="page">
      {!activeGame ? (
        <GameSetup
          players={players}
          selectedPlayerIds={selectedPlayers}
          onPlayerSelectionChange={setSelectedPlayers}
          totalRounds={totalRounds}
          onTotalRoundsChange={setTotalRounds}
          gameType={gameType}
          onGameTypeChange={setGameType}
          gameDate={gameDate}
          onGameDateChange={setGameDate}
          gameNotes={gameNotes}
          onGameNotesChange={setGameNotes}
          gameLocation={gameLocation}
          onGameLocationChange={setGameLocation}
          onCreateGame={handleCreateGame}
        />
      ) : (
        <ActiveGame
          game={activeGame}
          gameStats={gameStats}
          rounds={rounds}
          chartData={chartData}
          onRoundUpdate={updateRound}
          onReload={() => loadGameData(activeGame.id)}
          onAdjustRounds={adjustRounds}
          onEditMetadata={editMetadata}
          onMinimizeGame={minimizeGame}
          onDeleteGame={deleteGame}
          onFinishGame={finishGame}
          onReorderPlayers={reorderPlayers}
          onEvictPlayer={evictPlayer}
          onAcknowledgeImport={acknowledgeImport}
        />
      )}
    </div>
  );
}

export default GamePlay;

