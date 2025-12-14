import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const playersApi = {
  getAll: () => api.get('/players'),
  get: (id) => api.get(`/players/${id}`),
  getFamily: (id) => api.get(`/players/${id}/family`),
  create: (data) => api.post('/players', data),
  update: (id, data) => api.put(`/players/${id}`, data),
  delete: (id) => api.delete(`/players/${id}`),
  getStats: (id) => api.get(`/players/${id}/stats`),
  getBetDistribution: (id) => api.get(`/players/${id}/bet-distribution`),
};

export const gamesApi = {
  getAll: (activeOnly = false) => api.get('/games', { params: { active_only: activeOnly } }),
  get: (id) => api.get(`/games/${id}`),
  create: (data) => api.post('/games', data),
  finish: (id) => api.post(`/games/${id}/finish`),
  getRounds: (id) => api.get(`/games/${id}/rounds`),
  addRound: (id, data) => api.post(`/games/${id}/rounds`, data),
  getStats: (id) => api.get(`/games/${id}/stats`),
  upsertRound: (gameId, roundNumber, playerId, bet, success) => 
    api.post(`/games/${gameId}/rounds/upsert`, null, {
      params: { round_number: roundNumber, player_id: playerId, bet, success }
    }),
};

export default api;
