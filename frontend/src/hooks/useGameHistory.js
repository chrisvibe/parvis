import { useState, useEffect, useMemo, useCallback } from 'react';
import { gamesApi } from '../api';
import { getSetting } from '../utils/settings';
import { formatDateTime } from '../utils/datetime';
import { buildCumulativeScoreData } from '../utils/chartData';

/**
 * Match a game against the search box.
 *
 * Status is searchable as the word shown on screen, so typing "finished" does
 * what it looks like it should.
 */
const matchesSearch = (game, term) => {
  if (!term) return true;

  // The same formatter the list itself uses, so what is searchable is exactly
  // what is on screen — typing "04/08" finds the game that says 04/08.
  const date = formatDateTime(game.date).toLowerCase();

  const status = game.is_valid ? 'finished' : 'unfinished';

  return (
    game.id.toString().includes(term) ||
    date.includes(term) ||
    status.includes(term) ||
    (game.notes || '').toLowerCase().includes(term) ||
    (game.location || '').toLowerCase().includes(term)
  );
};

/**
 * The finished games, the search over them, and whichever one is open.
 *
 * @param {String} locationKey - changes when the page is navigated to, which is
 *        the cue to re-read the list (a game may have just been finished)
 */
export function useGameHistory(locationKey) {
  const [allGames, setAllGames] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  const [selectedGameId, setSelectedGameId] = useState(null);
  const [game, setGame] = useState(null);
  const [gameStats, setGameStats] = useState([]);
  const [rounds, setRounds] = useState([]);

  const loadGames = useCallback(async () => {
    try {
      const response = await gamesApi.getAll(false);
      setAllGames(
        response.data
          .filter((candidate) => !candidate.is_active)
          .sort((a, b) => b.id - a.id)
      );
    } catch (error) {
      console.error('Error loading games:', error);
    }
  }, []);

  useEffect(() => {
    loadGames();
  }, [loadGames, locationKey]);

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearchTerm(searchTerm.trim().toLowerCase()),
      getSetting('search.debounce_ms', 300)
    );
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const displayGames = useMemo(() => {
    const matching = allGames.filter((candidate) => matchesSearch(candidate, debouncedSearchTerm));

    // With no search term this is a "recent games" list rather than everything.
    return debouncedSearchTerm
      ? matching
      : matching.slice(0, getSetting('display.default_recent_games', 5));
  }, [allGames, debouncedSearchTerm]);

  const selectGame = useCallback(async (gameId) => {
    if (!gameId) {
      setSelectedGameId(null);
      setGame(null);
      setGameStats([]);
      setRounds([]);
      return;
    }

    try {
      const [gameResponse, statsResponse, roundsResponse] = await Promise.all([
        gamesApi.get(gameId),
        gamesApi.getStats(gameId),
        gamesApi.getRounds(gameId),
      ]);

      setSelectedGameId(gameId);
      setGame(gameResponse.data);
      setGameStats(statsResponse.data);
      setRounds(roundsResponse.data);
    } catch (error) {
      console.error('Error loading game data:', error);
    }
  }, []);

  const chartData = useMemo(
    () => buildCumulativeScoreData(gameStats, rounds, game?.total_rounds),
    [gameStats, rounds, game]
  );

  return {
    allGames,
    displayGames,
    searchTerm,
    setSearchTerm,
    isSearching: Boolean(debouncedSearchTerm),
    selectedGameId,
    selectGame,
    game,
    gameStats,
    chartData,
  };
}
