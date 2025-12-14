import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import GamePlay from './pages/GamePlay';
import Stats from './pages/Stats';
import Players from './pages/Players';
import About from './pages/About';
import { getSetting } from './utils/settings';

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
      </div>
    </nav>
  );
}

function App() {
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
