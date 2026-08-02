import React, { useState } from 'react';
import { authApi, storePassword } from '../api';

/**
 * Full-screen password prompt.
 *
 * Only rendered after the API has answered 401, so it never appears when no
 * password is configured. On success the page reloads rather than replaying
 * whichever requests failed — simpler, and a reload is instant on a LAN.
 */
function LoginGate() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) return;

    setChecking(true);
    setError('');

    try {
      await authApi.check(password);
      storePassword(password);
      window.location.reload();
    } catch (err) {
      if (err.response?.status === 401) {
        setError('WRONG PASSWORD');
      } else {
        setError('COULD NOT REACH SERVER');
      }
      setPassword('');
      setChecking(false);
    }
  };

  return (
    <div className="app">
      <div className="card" style={{ maxWidth: '420px', margin: '80px auto' }}>
        <h2>PARVIS</h2>
        <p style={{ opacity: 0.7, marginBottom: '20px' }}>
          This registry is password protected.
        </p>

        <form onSubmit={handleSubmit}>
          <label>PASSWORD</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password..."
            autoFocus
          />

          {error && (
            <div className="error" style={{ marginTop: '15px' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={checking} style={{ marginTop: '20px' }}>
            {checking ? 'CHECKING...' : 'ENTER'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginGate;
