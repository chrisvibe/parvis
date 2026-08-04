import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { gamesApi } from '../api';
import { usePlayerStats, useGameHistory } from '../hooks';
import PlayerStatsPanel from '../components/PlayerStatsPanel';
import GameHistoryViewer from '../components/GameHistoryViewer';

/**
 * The statistics page: lifetime figures per player, and a browser for finished
 * games.
 *
 * This file was 717 lines. Almost none of it was about being a page — it was
 * loading, combining and drawing, all of which now live in hooks and components
 * that the live game can use too. What is left is the page: which panels there
 * are, and what happens when you ask to edit a game.
 */
function Stats() {
  const navigate = useNavigate();
  const location = useLocation();

  const playerStats = usePlayerStats();
  // Keyed on location so that coming back from finishing a game re-reads the
  // list rather than showing the game as still in progress.
  const history = useGameHistory(location.key);

  const handleEditGame = async (gameId) => {
    if (!window.confirm('Reactivate this game for editing? You can modify rounds and finish it again.')) {
      return;
    }

    try {
      await gamesApi.reactivate(gameId);
      navigate('/');
    } catch (error) {
      console.error('Error reactivating game:', error);
      alert('Error reactivating game. Please try again.');
    }
  };

  if (playerStats.loading) return <div className="loading">LOADING...</div>;

  if (playerStats.players.length === 0) {
    return (
      <div className="card">
        <h2>NO STATISTICS AVAILABLE</h2>
        <p>No players registered yet. Go to PLAYERS page to add players.</p>
      </div>
    );
  }

  return (
    <div>
      <PlayerStatsPanel
        players={playerStats.players}
        selectedPlayerIds={playerStats.selectedPlayerIds}
        onSelectionChange={playerStats.selectPlayers}
        stats={playerStats.stats}
        betDistribution={playerStats.betDistribution}
      />

      <GameHistoryViewer history={history} onEditGame={handleEditGame} />
    </div>
  );
}

export default Stats;
