import { useCallback } from 'react';
import { gamesApi } from '../api';

/**
 * Custom hook for game actions (create, finish, cancel, adjust, etc.).
 * 
 * @param {Object} activeGame - Current active game object
 * @param {Function} loadGameData - Function to reload game data
 * @param {Function} clearGame - Function to clear game state
 * @param {Function} navigate - React Router navigate function
 * @returns {Object} Game action functions
 */
export function useGameActions(activeGame, loadGameData, clearGame, navigate) {
  
  /**
   * Create a new game with selected players.
   */
  const createGame = useCallback(async (gameData) => {
    try {
      const res = await gamesApi.create(gameData);
      
      // Initialize Round 1 with bet=0 for all players
      await Promise.all(
        gameData.player_ids.map(playerId =>
          gamesApi.upsertRound(res.data.id, 1, playerId, 0, false)
        )
      );
      
      // Load game data
      await loadGameData(res.data.id);
      
      return res.data;
    } catch (error) {
      console.error('Error creating game:', error);
      throw error;
    }
  }, [loadGameData]);

  /**
   * Update a round (called when user edits a cell).
   */
  const updateRound = useCallback(async (roundData) => {
    if (!activeGame) return;

    try {
      await gamesApi.upsertRound(
        activeGame.id,
        roundData.round,
        roundData.playerId,
        roundData.bet,
        roundData.success
      );

      // Reload game data
      await loadGameData(activeGame.id);
    } catch (error) {
      console.error('Error updating round:', error);
      throw error;
    }
  }, [activeGame, loadGameData]);

  /**
   * Finish the current game.
   */
  const finishGame = useCallback(async () => {
    if (!activeGame) return;
    
    if (!window.confirm('Finish this game? This will mark it as complete and count toward statistics.')) {
      return;
    }

    try {
      await gamesApi.finish(activeGame.id);
      clearGame();
      
      // Small delay to ensure DB commits
      setTimeout(() => {
        navigate('/stats');
      }, 300);
    } catch (error) {
      console.error('Error finishing game:', error);
      throw error;
    }
  }, [activeGame, clearGame, navigate]);

  /**
   * Cancel the current game.
   */
  const cancelGame = useCallback(async () => {
    if (!activeGame) return;
    
    if (!window.confirm('Cancel this game? It will not count toward statistics.')) {
      return;
    }

    try {
      await gamesApi.cancel(activeGame.id);
      clearGame();
    } catch (error) {
      console.error('Error cancelling game:', error);
      throw error;
    }
  }, [activeGame, clearGame]);

  /**
   * Adjust the total number of rounds.
   */
  const adjustRounds = useCallback(async () => {
    if (!activeGame) return;
    
    const newTotal = prompt(
      `Adjust total rounds (currently ${activeGame.total_rounds}):`,
      activeGame.total_rounds
    );
    
    if (newTotal === null) return; // User cancelled
    
    const num = parseInt(newTotal);
    if (isNaN(num) || num < 1) {
      alert('Please enter a valid number (at least 1)');
      return;
    }
    
    try {
      await gamesApi.adjustRounds(activeGame.id, num);
      await loadGameData(activeGame.id);
    } catch (error) {
      console.error('Error adjusting rounds:', error);
      throw error;
    }
  }, [activeGame, loadGameData]);

  /**
   * Edit game metadata (notes, location).
   */
  const editMetadata = useCallback(async () => {
    if (!activeGame) return;
    
    const newNotes = prompt('Game Notes:', activeGame.notes || '');
    const newLocation = prompt('Game Location:', activeGame.location || '');
    
    if (newNotes === null && newLocation === null) return; // User cancelled
    
    try {
      await gamesApi.updateMetadata(activeGame.id, {
        notes: newNotes === null ? activeGame.notes : newNotes,
        location: newLocation === null ? activeGame.location : newLocation
      });
      await loadGameData(activeGame.id);
    } catch (error) {
      console.error('Error updating metadata:', error);
      throw error;
    }
  }, [activeGame, loadGameData]);

  return {
    createGame,
    updateRound,
    finishGame,
    cancelGame,
    adjustRounds,
    editMetadata,
  };
}
