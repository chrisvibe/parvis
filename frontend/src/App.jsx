import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import GamePlay from './pages/GamePlay';
import Stats from './pages/Stats';
import Players from './pages/Players';
import About from './pages/About';
import LoginGate from './components/LoginGate';
import { getSetting } from './utils/settings';
import { setUnauthorizedHandler, hasStoredPassword, logOut } from './api';

function Navigation() {
  const location = useLocation();
  const [leftCard, setLeftCard] = useState('');
  const [rightCard, setRightCard] = useState('');
  
  useEffect(() => {
    setLeftCard(getSetting('display.header_left_card', '/cards/Queen_of_hearts_en.svg'));
    setRightCard(getSetting('display.header_right_card', '/cards/King_of_spades_en.svg'));
  }, []);
  
  return (
    <nav className="nav">
      <div className="nav-header">
        {leftCard && <img src={leftCard} alt="Left card" className="header-card" />}
        <h1>PARVIS</h1>
        {rightCard && <img src={rightCard} alt="Right card" className="header-card" />}
      </div>
      <div className="nav-buttons">
        <Link to="/" className={`button ${location.pathname === '/' ? 'active' : ''}`}>
          PLAY GAME
        </Link>
        <Link to="/stats" className={`button ${location.pathname === '/stats' ? 'active' : ''}`}>
          STATISTICS
        </Link>
        <Link to="/players" className={`button ${location.pathname === '/players' ? 'active' : ''}`}>
          PLAYERS
        </Link>
        <Link to="/about" className={`button ${location.pathname === '/about' ? 'active' : ''}`}>
          ABOUT
        </Link>
        {/*
          Only shown to a browser that is actually holding a password. On an
          open site there is nothing to log out of, and a button saying
          otherwise would advertise a lock that does not exist.
        */}
        {hasStoredPassword() && (
          <button type="button" className="button button-logout" onClick={logOut}>
            LOG OUT
          </button>
        )}
      </div>
    </nav>
  );
}

function App() {
  // Raised only when the API rejects a password; stays false when the server
  // has no password configured.
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => setLocked(true));
    return () => setUnauthorizedHandler(null);
  }, []);

  if (locked) {
    return <LoginGate />;
  }

  return (
    <Router>
      <div className="app">
        <Navigation />
        <Routes>
          <Route path="/" element={<GamePlay />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/players" element={<Players />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
