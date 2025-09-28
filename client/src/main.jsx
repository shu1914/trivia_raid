import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Visual from './visual/Visual';
import Control from './control/Control';
import { GameProvider } from './state/GameContext';
import './styles.css';

function App(){
  return (
    <GameProvider>
      <BrowserRouter>
        <div className="topbar">
          <Link to="/visual">Visual</Link>
          <Link to="/control">Control</Link>
        </div>
        <Routes>
          <Route path="/" element={<Visual />} />
          <Route path="/visual" element={<Visual />} />
          <Route path="/control" element={<Control />} />
        </Routes>
      </BrowserRouter>
    </GameProvider>
  );
}

createRoot(document.getElementById('root')).render(<App />);
