import { useCallback } from 'react';
import { gamesApi, runDestructive } from '../api';
import { fromLocalInputValue } from '../utils/datetime';
import { defaultSuccess } from '../utils/gameRules';

/**
 * Custom hook for game actions (create, finish, cancel, adjust, etc.).
 * 
 * @param {Object} activeGame - Current active game object
 * @param {Function} loadGameData - Function to reload game data
 * @param {Function} clearGame - Function to clear game state
 * @param {Function} navigate - React Router navigate function
 * @param {Function} setGameStats - Writes the player list directly. Only
 *        reorderPlayers uses it, and only so a dragged column moves under the
 *        cursor instead of after a round trip.
 * @returns {Object} Game action functions
 */
export function useGameActions(activeGame, loadGameData, clearGame, navigate, setGameStats) {

  /**
   * Create a new game with selected players.
   */
  const createGame = useCallback(async (gameData) => {
    try {
      const res = await gamesApi.create(gameData);

      // Open round 1 for everyone. The starting success flag is a setting
      // because it decides which way round MARK RESULTS is worked: assuming
      // success means clicking the players who went down, which is the shorter
      // list.
      await Promise.all(
        gameData.player_ids.map(playerId =>
          gamesApi.upsertRound(res.data.id, 1, playerId, 0, defaultSuccess())
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
      await runDestructive(adminPassword => gamesApi.delete(activeGame.id, adminPassword));
      clearGame();
    } catch (error) {
      console.error('Error deleting game:', error);
      if (error.response?.status === 403) {
        alert('Wrong admin password. Game not deleted.');
        return;
      }
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
   * Save edited game metadata (type, date, notes, location).
   *
   * The form does the asking; this only sends it. The date arrives as the
   * browser's local wall-clock string and goes out as an ISO instant.
   */
  const editMetadata = useCallback(async (values) => {
    if (!activeGame) return;

    try {
      await gamesApi.updateMetadata(activeGame.id, {
        notes: values.notes,
        location: values.location,
        game_type: values.game_type,
        date: fromLocalInputValue(values.date),
      });
      await loadGameData(activeGame.id);
    } catch (error) {
      console.error('Error updating metadata:', error);
      alert('Error saving game details. Please try again.');
      throw error;
    }
  }, [activeGame, loadGameData]);

  /**
   * Reseat the players.
   *
   * Applied locally first. A column has to move the instant it is dropped —
   * waiting for the server would make a drag feel like it had failed — and the
   * new order is a pure rearrangement of rows already on screen, so showing it
   * before it is stored claims nothing that isn't true.
   *
   * If the write does fail, the server's own answer is reloaded rather than an
   * order remembered from before the drag: whatever is stored is the truth
   * about whose round it is, and that is what the screen should show.
   */
  const reorderPlayers = useCallback(async (playerIds) => {
    if (!activeGame) return;

    setGameStats((current) => {
      const byId = new Map(current.map((stat) => [stat.player_id, stat]));
      return playerIds.map((id) => byId.get(id)).filter(Boolean);
    });

    try {
      await gamesApi.setPlayerOrder(activeGame.id, playerIds);
    } catch (error) {
      console.error('Error reordering players:', error);
      alert('Could not save the new player order.');
      await loadGameData(activeGame.id);
    }
  }, [activeGame, loadGameData, setGameStats]);

  return {
    createGame,
    updateRound,
    finishGame,
    minimizeGame,
    deleteGame,
    adjustRounds,
    editMetadata,
    reorderPlayers,
  };
}
