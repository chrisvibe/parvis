import React, { useState, useEffect } from 'react';
import { playersApi } from '../api';

function Players() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    alias: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    birthdate: ''
  });

  useEffect(() => {
    loadPlayers();
  }, []);

  const loadPlayers = async () => {
    try {
      setLoading(true);
      const res = await playersApi.getAll();
      setPlayers(res.data);
    } catch (error) {
      console.error('Error loading players:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.alias.trim()) {
      alert('Alias is required');
      return;
    }

    try {
      const submitData = {
        alias: formData.alias.trim(),
        first_name: formData.first_name.trim() || null,
        middle_name: formData.middle_name.trim() || null,
        last_name: formData.last_name.trim() || null,
        birthdate: formData.birthdate || null
      };

      await playersApi.create(submitData);
      
      // Reset form and reload
      setFormData({
        alias: '',
        first_name: '',
        middle_name: '',
        last_name: '',
        birthdate: ''
      });
      setShowAddForm(false);
      loadPlayers();
    } catch (error) {
      console.error('Error creating player:', error);
      if (error.response?.status === 400) {
        alert('Alias already exists. Please choose a different alias.');
      } else {
        alert('Error creating player');
      }
    }
  };

  const handleDelete = async (playerId, alias) => {
    if (!window.confirm(`Delete player "${alias}"? This cannot be undone.`)) {
      return;
    }

    try {
      await playersApi.delete(playerId);
      loadPlayers();
    } catch (error) {
      console.error('Error deleting player:', error);
      alert('Error deleting player. They may have game history.');
    }
  };

  if (loading) return <div className="loading">LOADING...</div>;

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>PLAYER REGISTRY</h2>
          <button onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? 'CANCEL' : '+ ADD PLAYER'}
          </button>
        </div>

        {showAddForm && (
          <div className="card" style={{ background: '#0a0e27', marginBottom: '30px' }}>
            <h3 style={{ color: '#00ff00', marginBottom: '15px' }}>NEW PLAYER</h3>
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

              <label>FIRST NAME</label>
              <input
                type="text"
                name="first_name"
                value={formData.first_name}
                onChange={handleInputChange}
                placeholder="Optional..."
              />

              <label>MIDDLE NAME</label>
              <input
                type="text"
                name="middle_name"
                value={formData.middle_name}
                onChange={handleInputChange}
                placeholder="Optional..."
              />

              <label>LAST NAME</label>
              <input
                type="text"
                name="last_name"
                value={formData.last_name}
                onChange={handleInputChange}
                placeholder="Optional..."
              />

              <label>BIRTHDATE</label>
              <input
                type="date"
                name="birthdate"
                value={formData.birthdate}
                onChange={handleInputChange}
              />

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit">CREATE PLAYER</button>
                <button type="button" onClick={() => setShowAddForm(false)} className="danger">
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
                <th>NAME</th>
                <th>BIRTHDATE</th>
                <th>REGISTERED</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {players.map(player => {
                const fullName = [
                  player.first_name,
                  player.middle_name,
                  player.last_name
                ].filter(Boolean).join(' ') || '-';

                return (
                  <tr key={player.id}>
                    <td style={{ color: '#00ff00', fontWeight: 'bold' }}>
                      {player.alias}
                    </td>
                    <td>{fullName}</td>
                    <td>
                      {player.birthdate 
                        ? new Date(player.birthdate).toLocaleDateString()
                        : '-'
                      }
                    </td>
                    <td>
                      {new Date(player.registration_date).toLocaleDateString()}
                    </td>
                    <td>
                      <button
                        onClick={() => handleDelete(player.id, player.alias)}
                        className="danger"
                        style={{ padding: '5px 15px', fontSize: '0.9rem' }}
                      >
                        DELETE
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: '30px', padding: '15px', border: '1px solid #00ff00', background: 'rgba(0, 255, 0, 0.05)' }}>
          <strong style={{ color: '#00ff00' }}>TOTAL PLAYERS:</strong> {players.length}
        </div>
      </div>
    </div>
  );
}

export default Players;
