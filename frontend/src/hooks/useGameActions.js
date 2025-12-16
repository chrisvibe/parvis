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
    
    // Can only finish if on the last round
    if (activeGame.current_round !== activeGame.total_rounds) {
      alert(`You must complete all rounds before finishing. Currently on round ${activeGame.current_round} of ${activeGame.total_rounds}.`);
      return;
    }
    
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
   * Minimize (cancel) the current game - exits but keeps in database.
   */
  const minimizeGame = useCallback(async () => {
    if (!activeGame) return;
    
    if (!window.confirm('Minimize this game? It will remain in the database but won\'t be active.')) {
      return;
    }

    try {
      await gamesApi.cancel(activeGame.id);
      clearGame();
    } catch (error) {
      console.error('Error minimizing game:', error);
      throw error;
    }
  }, [activeGame, clearGame]);

  /**
   * Permanently delete the current game.
   */
  const deleteGame = useCallback(async () => {
    if (!activeGame) return;
    
    if (!window.confirm('Permanently DELETE this game? This cannot be undone and will remove all data.')) {
      return;
    }

    try {
      await gamesApi.delete(activeGame.id);
      clearGame();
    } catch (error) {
      console.error('Error deleting game:', error);
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
    minimizeGame,
    deleteGame,
    adjustRounds,
    editMetadata,
  };
}
