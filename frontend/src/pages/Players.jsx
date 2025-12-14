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

  const handleParentToggle = (parentId) => {
    const currentParents = formData.parent_ids || [];
    if (currentParents.includes(parentId)) {
      setFormData({
        ...formData,
        parent_ids: currentParents.filter(id => id !== parentId)
      });
    } else {
      setFormData({
        ...formData,
        parent_ids: [...currentParents, parentId]
      });
    }
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

              <label>PARENTS (select multiple)</label>
              <div style={{ 
                maxHeight: '200px', 
                overflow: 'auto', 
                border: '2px solid #00ff00', 
                padding: '10px', 
                margin: '10px 0',
                background: '#16213e'
              }}>
                {availableParents.length === 0 ? (
                  <div style={{ color: '#00ff00', opacity: 0.5, textAlign: 'center', padding: '10px' }}>
                    No other players available
                  </div>
                ) : (
                  availableParents.map(player => (
                    <label 
                      key={player.id} 
                      style={{ 
                        display: 'block', 
                        cursor: 'pointer', 
                        padding: '5px',
                        background: formData.parent_ids.includes(player.id) ? 'rgba(0, 255, 0, 0.1)' : 'transparent'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={formData.parent_ids.includes(player.id)}
                        onChange={() => handleParentToggle(player.id)}
                      />
                      {' '}{player.alias}
                      {player.birthdate && ` (${new Date(player.birthdate).toLocaleDateString('en-GB')})`}
                    </label>
                  ))
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
