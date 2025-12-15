import React, { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { playersApi } from '../api';
import { getSetting } from '../utils/settings';

function Players() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    alias: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    birthdate: null,
    parent_ids: []
  });
  const [parentSearchTerm, setParentSearchTerm] = useState('');

  useEffect(() => {
    loadPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleDateChange = (date) => {
    setFormData({
      ...formData,
      birthdate: date
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.alias.trim()) {
      alert('Alias is required');
      return;
    }

    // Check for circular parent relationships
    if (editingPlayer && formData.parent_ids.includes(editingPlayer.id)) {
      alert('A player cannot be their own parent!');
      return;
    }

    try {
      const submitData = {
        alias: formData.alias.trim(),
        first_name: formData.first_name.trim() || null,
        middle_name: formData.middle_name.trim() || null,
        last_name: formData.last_name.trim() || null,
        birthdate: formData.birthdate ? formData.birthdate.toISOString().split('T')[0] : null,
        parent_ids: formData.parent_ids || []
      };

      if (editingPlayer) {
        await playersApi.update(editingPlayer.id, submitData);
      } else {
        await playersApi.create(submitData);
      }
      
      // Reset form and reload
      resetForm();
      loadPlayers();
    } catch (error) {
      console.error('Error saving player:', error);
      if (error.response?.status === 400) {
        alert(error.response.data.detail || 'Alias already exists or invalid data');
      } else {
        alert('Error saving player');
      }
    }
  };

  const handleEdit = (player) => {
    setEditingPlayer(player);
    setFormData({
      alias: player.alias,
      first_name: player.first_name || '',
      middle_name: player.middle_name || '',
      last_name: player.last_name || '',
      birthdate: player.birthdate ? new Date(player.birthdate) : null,
      parent_ids: player.parent_ids || []
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      alias: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      birthdate: null,
      parent_ids: []
    });
    setParentSearchTerm('');
    setEditingPlayer(null);
    setShowForm(false);
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

  // Available parents (exclude self when editing)
  const availableParents = players.filter(p => 
    !editingPlayer || p.id !== editingPlayer.id
  );

  if (loading) return <div className="loading">LOADING...</div>;

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>PLAYER REGISTRY</h2>
          <button onClick={() => { resetForm(); setShowForm(!showForm); }}>
            {showForm ? 'CANCEL' : '+ ADD PLAYER'}
          </button>
        </div>

        {showForm && (
          <div className="card" style={{ background: '#0a0e27', marginBottom: '30px' }}>
            <h3 style={{ color: '#00ff00', marginBottom: '15px' }}>
              {editingPlayer ? `EDIT PLAYER: ${editingPlayer.alias}` : 'NEW PLAYER'}
            </h3>
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

              <label>BIRTHDATE (DD/MM/YYYY)</label>
              <DatePicker
                selected={formData.birthdate}
                onChange={handleDateChange}
                dateFormat="dd/MM/yyyy"
                placeholderText="Select date..."
                showYearDropdown
                scrollableYearDropdown
                yearDropdownItemNumber={100}
                maxDate={new Date()}
                className="date-picker-input"
              />

              <label>PARENTS</label>
              {/* Search input for filtering */}
              <div style={{ marginBottom: '10px' }}>
                <input
                  type="text"
                  placeholder="Filter dropdown by name... (then select below)"
                  value={parentSearchTerm}
                  onChange={(e) => setParentSearchTerm(e.target.value)}
                  style={{ marginBottom: '10px' }}
                />
              </div>

              {/* Dropdown to select parents */}
              <select
                value=""
                onChange={(e) => {
                  const selectedId = parseInt(e.target.value);
                  if (selectedId && !formData.parent_ids.includes(selectedId)) {
                    setFormData({
                      ...formData,
                      parent_ids: [...formData.parent_ids, selectedId]
                    });
                    setParentSearchTerm(''); // Clear search after selection
                  }
                }}
                style={{ width: '100%', marginBottom: '10px' }}
              >
                <option value="">
                  {parentSearchTerm ? '-- Click to see filtered results --' : '-- Select a parent --'}
                </option>
                {availableParents
                  .filter(p => 
                    !formData.parent_ids.includes(p.id) &&
                    (parentSearchTerm === '' ||
                     p.alias.toLowerCase().includes(parentSearchTerm.toLowerCase()) ||
                     (p.first_name && p.first_name.toLowerCase().includes(parentSearchTerm.toLowerCase())) ||
                     (p.last_name && p.last_name.toLowerCase().includes(parentSearchTerm.toLowerCase())))
                  )
                  .map(player => (
                    <option key={player.id} value={player.id}>
                      {player.alias}
                      {player.birthdate && ` (${new Date(player.birthdate).toLocaleDateString('en-GB')})`}
                    </option>
                  ))
                }
              </select>

              {/* Selected parents list */}
              <div style={{ 
                border: '2px solid #00ff00', 
                padding: '10px', 
                margin: '10px 0',
                background: '#16213e',
                minHeight: '60px'
              }}>
                <div style={{ color: '#00ff00', marginBottom: '10px', fontSize: '0.9rem', opacity: 0.7 }}>
                  Selected Parents:
                </div>
                {formData.parent_ids.length === 0 ? (
                  <div style={{ color: '#00ff00', opacity: 0.5, textAlign: 'center', padding: '10px' }}>
                    No parents selected
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {formData.parent_ids.map(parentId => {
                      const parent = players.find(p => p.id === parentId);
                      if (!parent) return null;
                      return (
                        <div 
                          key={parentId}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '5px 10px',
                            background: '#0a0e27',
                            border: '1px solid #00ff00',
                            borderRadius: '4px'
                          }}
                        >
                          <span style={{ color: '#00ff00' }}>
                            {parent.alias}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setFormData({
                                ...formData,
                                parent_ids: formData.parent_ids.filter(id => id !== parentId)
                              });
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#ff0000',
                              cursor: 'pointer',
                              padding: '0 5px',
                              fontSize: '1.2rem',
                              lineHeight: '1'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit">
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
                <th>NAME</th>
                <th>BIRTHDATE</th>
                <th>PARENTS</th>
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

                const parentNames = (player.parent_ids || [])
                  .map(pid => players.find(p => p.id === pid)?.alias)
                  .filter(Boolean)
                  .join(', ') || '-';

                return (
                  <tr key={player.id}>
                    <td style={{ color: '#00ff00', fontWeight: 'bold' }}>
                      {player.alias}
                    </td>
                    <td>{fullName}</td>
                    <td>
                      {player.birthdate 
                        ? new Date(player.birthdate).toLocaleDateString('en-GB')
                        : '-'
                      }
                    </td>
                    <td style={{ fontSize: '0.9em' }}>{parentNames}</td>
                    <td>
                      {new Date(player.registration_date).toLocaleDateString('en-GB')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button
                          onClick={() => handleEdit(player)}
                          style={{ padding: '5px 15px', fontSize: '0.9rem' }}
                        >
                          EDIT
                        </button>
                        <button
                          onClick={() => handleDelete(player.id, player.alias)}
                          className="danger"
                          style={{ padding: '5px 15px', fontSize: '0.9rem' }}
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

        <div style={{ marginTop: '30px', padding: '15px', border: '1px solid #00ff00', background: 'rgba(0, 255, 0, 0.05)' }}>
          <strong style={{ color: '#00ff00' }}>TOTAL PLAYERS:</strong> {players.length}
        </div>
      </div>
    </div>
  );
}

export default Players;
