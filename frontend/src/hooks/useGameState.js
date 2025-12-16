import { useState, useEffect, useRef, useCallback } from 'react';
import { gamesApi, playersApi } from '../api';

/**
 * Custom hook for managing game state and data loading.
 * 
 * Handles:
 * - Loading all players
 * - Loading active game
 * - Loading game details (rounds, stats)
 * - Preventing duplicate loads
 * 
 * @param {Object} location - React Router location object (optional, for reload detection)
 * @returns {Object} Game state and loading functions
 */
export function useGameState(location = null) {
  const loadingRef = useRef(false);
  
  // Players data
  const [players, setPlayers] = useState([]);
  
  // Active game data
  const [activeGame, setActiveGame] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [gameStats, setGameStats] = useState([]);
  
  // Loading state
  const [loading, setLoading] = useState(true);

  /**
   * Load game-specific data (rounds, stats).
   */
  const loadGameData = useCallback(async (gameId) => {
    try {
      const [gameRes, roundsRes, statsRes] = await Promise.all([
        gamesApi.get(gameId),
        gamesApi.getRounds(gameId),
        gamesApi.getStats(gameId)
      ]);
      
      setActiveGame(gameRes.data);
      setRounds(roundsRes.data);
      setGameStats(statsRes.data);
    } catch (error) {
      console.error('Error loading game data:', error);
      throw error;
    }
  }, []);

  /**
   * Load all data (players + active game).
   */
  const loadData = useCallback(async () => {
    if (loadingRef.current) {
      console.log('Already loading, skipping...');
      return;
    }
    
    try {
      loadingRef.current = true;
      setLoading(true);
      
      const [playersRes, gamesRes] = await Promise.all([
        playersApi.getAll(),
        gamesApi.getAll(true) // active only
      ]);
      
      setPlayers(playersRes.data);
      
      if (gamesRes.data.length > 0) {
        const game = gamesRes.data[0];
        setActiveGame(game);
        await loadGameData(game.id);
      } else {
        setActiveGame(null);
        setRounds([]);
        setGameStats([]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [loadGameData]);

  /**
   * Clear active game state.
   */
  const clearGame = useCallback(() => {
    setActiveGame(null);
    setRounds([]);
    setGameStats([]);
  }, []);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reload when location changes (e.g., navigating back from Stats)
  useEffect(() => {
    if (location?.pathname === '/' || location?.key) {
      loadData();
    }
  }, [location?.key, location?.pathname, loadData]);

  return {
    // State
    players,
    activeGame,
    rounds,
    gameStats,
    loading,
    
    // Actions
    loadData,
    loadGameData,
    clearGame,
    setActiveGame,
    setRounds,
    setGameStats,
  };
}
