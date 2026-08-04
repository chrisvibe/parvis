import React, { useState, useEffect, useCallback } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { playersApi, runDestructive } from '../api';
import RelationshipPicker, { RELATIONSHIPS } from '../components/RelationshipPicker';
import { formatDate, parseDate, toDateOnly } from '../utils/datetime';

// Mirrors EMAIL_PATTERN in backend/models.py
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const EMPTY_FORM = {
  alias: '',
  email: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  birthdate: null,
  parent_ids: [],
  child_ids: [],
  partner_ids: [],
};

/** The server's complaint, in the plainest form it came in. */
const errorMessage = (error) => {
  const detail = error.response?.data?.detail;

  if (Array.isArray(detail)) {
    // FastAPI validation error: detail is a list of {loc, msg, ...}
    return detail.map((d) => `${d.loc?.slice(-1)[0] ?? 'field'}: ${d.msg}`).join('\n');
  }

  return detail || 'Error saving player';
};

function Players() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const loadPlayers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await playersApi.getAll();
      setPlayers(res.data);
    } catch (error) {
      console.error('Error loading players:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditingPlayer(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.alias.trim()) {
      alert('Alias is required');
      return;
    }

    if (!EMAIL_PATTERN.test(formData.email.trim())) {
      alert('Email must look like name@example.com');
      return;
    }

    try {
      const submitData = {
        alias: formData.alias.trim(),
        email: formData.email.trim(),
        first_name: formData.first_name.trim() || null,
        middle_name: formData.middle_name.trim() || null,
        last_name: formData.last_name.trim() || null,
        birthdate: toDateOnly(formData.birthdate),
        parent_ids: formData.parent_ids,
        child_ids: formData.child_ids,
        partner_ids: formData.partner_ids,
      };

      if (editingPlayer) {
        await playersApi.update(editingPlayer.id, submitData);
      } else {
        await playersApi.create(submitData);
      }

      resetForm();
      loadPlayers();
    } catch (error) {
      console.error('Error saving player:', error);
      alert(errorMessage(error));
    }
  };

  const handleEdit = (player) => {
    setEditingPlayer(player);
    setFormData({
      alias: player.alias,
      email: player.email || '',
      first_name: player.first_name || '',
      middle_name: player.middle_name || '',
      last_name: player.last_name || '',
      birthdate: player.birthdate ? parseDate(player.birthdate) : null,
      parent_ids: player.parent_ids || [],
      child_ids: player.child_ids || [],
      partner_ids: player.partner_ids || [],
    });
    setShowForm(true);
  };

  const handleDelete = async (playerId, alias) => {
    if (!window.confirm(`Delete player "${alias}"? This cannot be undone.`)) return;

    try {
      await runDestructive((adminPassword) => playersApi.delete(playerId, adminPassword));
      loadPlayers();
    } catch (error) {
      console.error('Error deleting player:', error);
      if (error.response?.status === 403) {
        alert('Wrong admin password. Player not deleted.');
      } else {
        alert(error.response?.data?.detail || 'Error deleting player.');
      }
    }
  };

  const aliasFor = (id) => players.find((p) => p.id === id)?.alias;

  if (loading) return <div className="loading">LOADING...</div>;

  return (
    <div>
      <div className="card">
        <div className="toolbar">
          <h2>PLAYER REGISTRY</h2>
          <button onClick={() => { resetForm(); setShowForm(!showForm); }}>
            {showForm ? 'CANCEL' : '+ ADD PLAYER'}
          </button>
        </div>

        {showForm && (
          <div className="card inset">
            <h3>{editingPlayer ? `EDIT PLAYER: ${editingPlayer.alias}` : 'NEW PLAYER'}</h3>

            <form onSubmit={handleSubmit}>
              <label>ALIAS (REQUIRED) *</label>
              <input
                type="text"
                name="alias"
                value={formData.alias}
                onChange={handleInputChange}
                placeholder="Unique nickname..."
                required
              />

              <label>EMAIL (REQUIRED) *</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="name@example.com"
                required
              />

              <label>FIRST NAME (OPTIONAL)</label>
              <input
                type="text"
                name="first_name"
                value={formData.first_name}
                onChange={handleInputChange}
                placeholder="Optional..."
              />

              <label>MIDDLE NAME (OPTIONAL)</label>
              <input
                type="text"
                name="middle_name"
                value={formData.middle_name}
                onChange={handleInputChange}
                placeholder="Optional..."
              />

              <label>LAST NAME (OPTIONAL)</label>
              <input
                type="text"
                name="last_name"
                value={formData.last_name}
                onChange={handleInputChange}
                placeholder="Optional..."
              />

              <label>BIRTHDATE (OPTIONAL, DD/MM/YYYY)</label>
              <DatePicker
                selected={formData.birthdate}
                onChange={(date) => setFormData({ ...formData, birthdate: date })}
                dateFormat="dd/MM/yyyy"
                placeholderText="dd/mm/yyyy"
                calendarStartDay={1}
                showYearDropdown
                scrollableYearDropdown
                yearDropdownItemNumber={100}
                maxDate={new Date()}
                className="date-picker-input"
              />

              <RelationshipPicker
                players={players}
                value={formData}
                onChange={(next) => setFormData({ ...formData, ...next })}
                excludeId={editingPlayer?.id ?? null}
              />

              <div className="button-row">
                <button type="submit" className="primary">
                  {editingPlayer ? 'UPDATE PLAYER' : 'CREATE PLAYER'}
                </button>
                <button type="button" onClick={resetForm} className="danger">
                  CANCEL
                </button>
              </div>
            </form>
          </div>
        )}

        {players.length === 0 ? (
          <div className="error">
            No players registered yet. Click "ADD PLAYER" to create one.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ALIAS</th>
                <th>EMAIL</th>
                <th>NAME</th>
                <th>BIRTHDATE</th>
                <th>RELATIONSHIPS</th>
                <th>MATCHES</th>
                <th>REGISTERED</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => {
                const fullName = [player.first_name, player.middle_name, player.last_name]
                  .filter(Boolean).join(' ') || '-';

                const relationships = RELATIONSHIPS
                  .flatMap(({ field, label }) =>
                    (player[field] || [])
                      .map(aliasFor)
                      .filter(Boolean)
                      .map((alias) => `${alias} (${label.toLowerCase()})`)
                  )
                  .join(', ') || '-';

                return (
                  <tr key={player.id}>
                    <td className="text-key">{player.alias}</td>
                    <td className="text-small">
                      {player.email || (
                        <span
                          className="text-bad"
                          title="Registered before email was required — add one with EDIT"
                        >
                          MISSING
                        </span>
                      )}
                    </td>
                    <td>{fullName}</td>
                    <td>
                      {player.birthdate ? formatDate(player.birthdate) : '-'}
                    </td>
                    <td className="text-small">{relationships}</td>
                    <td>{player.games_played ?? 0}</td>
                    <td>{formatDate(player.registration_date)}</td>
                    <td>
                      <div className="button-row tight">
                        <button className="small" onClick={() => handleEdit(player)}>
                          EDIT
                        </button>
                        <button
                          className="small danger"
                          onClick={() => handleDelete(player.id, player.alias)}
                        >
                          DELETE
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="total-banner">
          <strong>TOTAL PLAYERS:</strong> {players.length}
        </div>
      </div>
    </div>
  );
}

export default Players;
