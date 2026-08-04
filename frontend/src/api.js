import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ---------------------------------------------------------------------------
// Optional password protection
//
// The backend decides whether a password is needed; the UI only reacts to 401
// (site password) and 403 (admin password, deletions only). With no passwords
// configured neither status ever occurs, so nothing here prompts and the app
// behaves exactly as it did before.
// ---------------------------------------------------------------------------

const PASSWORD_HEADER = 'X-Parvis-Password';
const ADMIN_PASSWORD_HEADER = 'X-Parvis-Admin-Password';
const PASSWORD_STORAGE_KEY = 'parvis_password';

export const getStoredPassword = () => localStorage.getItem(PASSWORD_STORAGE_KEY) || '';
export const storePassword = (password) => localStorage.setItem(PASSWORD_STORAGE_KEY, password);
export const clearStoredPassword = () => localStorage.removeItem(PASSWORD_STORAGE_KEY);

// Set by App so a rejected password can raise the login screen from anywhere.
let unauthorizedHandler = null;
export const setUnauthorizedHandler = (handler) => { unauthorizedHandler = handler; };

api.interceptors.request.use((config) => {
  const password = getStoredPassword();
  // Never clobber a header the caller set deliberately (the login check does).
  if (password && !config.headers[PASSWORD_HEADER]) {
    config.headers[PASSWORD_HEADER] = password;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearStoredPassword();
      if (unauthorizedHandler) unauthorizedHandler();
    }
    return Promise.reject(error);
  }
);

const adminConfig = (adminPassword) =>
  (adminPassword ? { headers: { [ADMIN_PASSWORD_HEADER]: adminPassword } } : {});

/**
 * Run a destructive request, asking for the admin password only if the server
 * demands one. Without an admin password configured the first attempt succeeds
 * and the user is never prompted.
 *
 * @param {Function} request - receives the admin password (null on first try)
 */
export const runDestructive = async (request) => {
  try {
    return await request(null);
  } catch (error) {
    if (error.response?.status !== 403) throw error;

    const password = window.prompt('ADMIN PASSWORD required to delete data:');
    if (!password) throw error;

    return await request(password);
  }
};

export const authApi = {
  // Explicit header: the password being tested is not stored yet.
  check: (password) => api.get('/auth/check', { headers: { [PASSWORD_HEADER]: password } }),
};

export const playersApi = {
  getAll: () => api.get('/players'),
  get: (id) => api.get(`/players/${id}`),
  getFamily: (id) => api.get(`/players/${id}/family`),
  create: (data) => api.post('/players', data),
  update: (id, data) => api.put(`/players/${id}`, data),
  delete: (id, adminPassword) => api.delete(`/players/${id}`, adminConfig(adminPassword)),
  getStats: (id) => api.get(`/players/${id}/stats`),
  getBetDistribution: (id) => api.get(`/players/${id}/bet-distribution`),
};

export const gamesApi = {
  getAll: (activeOnly = false) => api.get('/games', { params: { active_only: activeOnly } }),
  get: (id) => api.get(`/games/${id}`),
  create: (data) => api.post('/games', data),
  finish: (id) => api.post(`/games/${id}/finish`),
  cancel: (id) => api.post(`/games/${id}/cancel`),
  delete: (id, adminPassword) => api.delete(`/games/${id}`, adminConfig(adminPassword)),
  adjustRounds: (id, newTotal) => api.post(`/games/${id}/adjust-rounds`, null, { params: { new_total: newTotal } }),
  incrementRound: (id) => api.post(`/games/${id}/increment-round`),
  getRounds: (id) => api.get(`/games/${id}/rounds`),
  addRound: (id, data) => api.post(`/games/${id}/rounds`, data),
  getStats: (id) => api.get(`/games/${id}/stats`),
  upsertRound: (gameId, roundNumber, playerId, bet, success) => 
    api.post(`/games/${gameId}/rounds/upsert`, null, {
      params: { round_number: roundNumber, player_id: playerId, bet, success }
    }),
  reactivate: (gameId) => api.post(`/games/${gameId}/reactivate`),
  // The whole roster, in seat order. The backend refuses a partial list, since
  // the seats it left out would have no defined home.
  setPlayerOrder: (gameId, playerIds) =>
    api.put(`/games/${gameId}/player-order`, { player_ids: playerIds }),
  // Omitted params are left alone by the backend, so a caller can send only
  // what it means to change.
  updateMetadata: (gameId, data) => api.put(`/games/${gameId}/metadata`, null, {
    params: {
      notes: data.notes,
      location: data.location,
      game_type: data.game_type,
      date: data.date,
    }
  }),
};

export const hallOfFameApi = {
  get: () => api.get('/hall-of-fame'),
};

export default api;
