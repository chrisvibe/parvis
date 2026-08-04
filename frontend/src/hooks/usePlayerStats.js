import { useState, useEffect, useCallback } from 'react';
import { playersApi } from '../api';
import { combinePlayerStats, combineBetDistributions } from '../utils/playerStats';

/**
 * Players, which of them are selected, and their combined statistics.
 *
 * On first load it selects whoever has the best win rate, which is why it asks
 * for every player's statistics up front.
 */
export function usePlayerStats() {
  const [players, setPlayers] = useState([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
  const [stats, setStats] = useState(null);
  const [betDistribution, setBetDistribution] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadStatsFor = useCallback(async (playerIds, knownPlayers) => {
    if (!playerIds?.length) {
      setStats(null);
      setBetDistribution([]);
      return;
    }

    const roster = knownPlayers ?? players;

    try {
      const [statsResults, distributionResults] = await Promise.all([
        Promise.all(playerIds.map((id) => playersApi.getStats(id))),
        Promise.all(playerIds.map((id) => playersApi.getBetDistribution(id))),
      ]);

      const entries = playerIds.map((id, index) => ({
        id,
        alias: roster.find((player) => player.id === id)?.alias,
        stats: statsResults[index].data,
      }));

      setStats(combinePlayerStats(entries));
      setBetDistribution(combineBetDistributions(distributionResults.map((result) => result.data)));
    } catch (error) {
      console.error('Error loading player stats:', error);
    }
  }, [players]);

  const selectPlayers = useCallback((playerIds) => {
    setSelectedPlayerIds(playerIds);
    loadStatsFor(playerIds);
  }, [loadStatsFor]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await playersApi.getAll();
        if (cancelled) return;

        const roster = response.data;
        setPlayers(roster);

        if (roster.length > 0) {
          const results = await Promise.all(roster.map((player) => playersApi.getStats(player.id)));
          if (cancelled) return;

          let best = roster[0];
          let bestWinRate = -1;
          results.forEach((result, index) => {
            if (result.data.win_rate > bestWinRate) {
              bestWinRate = result.data.win_rate;
              best = roster[index];
            }
          });

          setSelectedPlayerIds([best.id]);
          await loadStatsFor([best.id], roster);
        }
      } catch (error) {
        console.error('Error loading players:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
    // Runs once: loadStatsFor is passed the roster explicitly so it does not
    // need to be a dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { players, selectedPlayerIds, selectPlayers, stats, betDistribution, loading };
}
