// client/src/control/Control.jsx
import React, { useState, useMemo } from 'react';
import { useGame } from '../state/GameContext';
import { motion, AnimatePresence } from 'framer-motion';

export default function Control() {
  const g = useGame();
  const st = g?.state;
  const socket = g?.socket;
  const winnerExists = !!st?.winner;

  const [names, setNames] = useState(['Team A', 'Team B', 'Team C', 'Team D', 'Team E']);
  const [bossHp, setBossHp] = useState(75);
  const [selectedPoints, setSelectedPoints] = useState(6);
  const [challenger, setChallenger] = useState(null);
  const [opponent, setOpponent] = useState(null);
  const pointsOptions = useMemo(() => [2, 4, 6, 8, 10], []);

  // Initialize game (host)
  const init = () => {
    const players = names.filter(Boolean).map((n, i) => ({ name: n }));
    if (!socket) return alert('Not connected to server');
    socket.emit('initGame', { players, bossHp, bossName: 'Riddlebeast' });
  };

  // Actions for the CURRENT player (server enforces turn order)
  function getCurrentPlayerIndex() {
    return st?.currentPlayerIndex ?? null;
  }

  function getCurrentPlayerName() {
    const idx = getCurrentPlayerIndex();
    return (st && typeof idx === 'number' && st.players[idx]) ? st.players[idx].name : '—';
  }

  const handleAttackBoss = () => {
    const idx = getCurrentPlayerIndex();
    if (idx === null || !socket) return;
    socket.emit('playerAction', { playerId: idx, action: 'attackBoss', value: Number(selectedPoints) });
  };

  const handleAttackPlayer = (targetIndex) => {
    const idx = getCurrentPlayerIndex();
    if (idx === null || !socket) return;
    if (targetIndex === idx) return alert('Cannot attack yourself');
    socket.emit('playerAction', { playerId: idx, action: 'attackPlayer', value: Number(selectedPoints), target: Number(targetIndex) });
  };

  const handleWrong = () => {
    const idx = getCurrentPlayerIndex();
    if (idx === null || !socket) return;
    socket.emit('playerAction', { playerId: idx, action: 'selfDamage', value: Number(selectedPoints) });
  };

  // PvP with dropdowns
  const handleDuel = (opponentSucceeded) => {
    if (!socket) return;
    if (challenger == null || opponent == null) {
      return alert('Select challenger and opponent');
    }
    if (challenger === opponent) return alert('Challenger and opponent must be different players');
    socket.emit('action:pvpResult', { challengerIndex: challenger, opponentIndex: opponent, opponentSucceeded });
    // reset after duel
    setChallenger(null);
    setOpponent(null);
  };

  // Force advance turn
  const forceAdvance = () => {
    if (!socket) return;
    socket.emit('action:endTurn', {});
  };

  return (
    <div className="container">
      {/* Winner notification */}
      <AnimatePresence>
        {st?.winner && (
          <motion.div
            key="winner-notification"
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{
              marginTop: 12,
              background: "linear-gradient(135deg, #d4edda, #c3e6cb)",
              border: "1px solid #28a745",
              borderRadius: 8,
              padding: 16,
              boxShadow: "0 0 10px rgba(40, 167, 69, 0.5)",
              color: "#155724",
              fontWeight: 700,
              textAlign: "center",
            }}
          >
            Winner Alert: <span style={{ fontSize: 18, fontWeight: 900 }}>{st.winner}</span>
            <div style={{ fontSize: 14, fontStyle: "italic", marginTop: 4 }}>
              Notify players: {st.winner} won this round!
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Game init */}
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Game Init</div>
        <div className="controls">
          {names.map((n, i) => (
            <input
              key={i}
              value={names[i]}
              onChange={e => {
                const copy = [...names];
                copy[i] = e.target.value;
                setNames(copy);
              }}
              placeholder={`Player ${i}`}
            />
          ))}
          <div style={{ marginTop: 8 }}>
            <label className="muted">Boss HP: </label>
            <input value={bossHp} onChange={e => setBossHp(Number(e.target.value))} style={{ width: 100 }} />
          </div>
          <button className="btn" onClick={init} style={{ marginTop: 8 }}>Initialize Game</button>
        </div>
      </div>

      {/* Current turn */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Current Turn</div>
        <div>
          Round <b>{st?.round ?? '—'}</b> — Now playing: <b>{getCurrentPlayerName()}</b>
        </div>

        <div style={{ marginTop: 10 }}>
          <label className="muted">Question value: </label>
          <select value={selectedPoints} onChange={e => setSelectedPoints(Number(e.target.value))}>
            {pointsOptions.map(p => <option key={p} value={p}>{p} pts</option>)}
          </select>
        </div>

        <div className="controls" style={{ marginTop: 8 }}>
          <button className="btn" onClick={handleAttackBoss}>Attack Boss (full)</button>

          {/* Attack specific player */}
          <div style={{ marginTop: 8 }}>
            <label className="muted">Attack player:</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {st?.players?.map((pl, i) => {
                const dead = pl.hp <= 0;
                return (
                  <button
                    key={i}
                    className="btn small"
                    style={{ opacity: dead ? 0.5 : 1 }}
                    disabled={i === st.currentPlayerIndex || dead}
                    onClick={() => handleAttackPlayer(i)}
                  >
                    {pl.name} ({pl.hp})
                  </button>
                );
              })}
            </div>
          </div>

          <button className="btn" onClick={handleWrong} style={{ marginTop: 8 }}>Apply Wrong Answer (self damage)</button>
        </div>
      </div>

      {/* PvP */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>PvP Duel</div>
        <div className="controls">
          <div>
            <label className="muted">Challenger: </label>
            <select
              value={challenger ?? ''}
              onChange={e => setChallenger(e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">—</option>
              {st?.players?.map((pl, i) => (
                <option key={i} value={i}>
                  {pl.name} ({pl.hp})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="muted">Opponent: </label>
            <select
              value={opponent ?? ''}
              onChange={e => setOpponent(e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">—</option>
              {st?.players
                ?.filter((_, i) => i !== challenger) // exclude challenger
                .map((pl, i) => (
                  <option key={pl.id ?? i} value={pl.id ?? i}>
                    {pl.name} ({pl.hp})
                  </option>
                ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn" onClick={() => handleDuel(true)}>Opponent Succeeded</button>
            <button className="btn" onClick={() => handleDuel(false)}>Opponent Failed</button>
          </div>
        </div>
      </div>

      {/* Other Controls */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Other Controls</div>
        <div className="controls">
          <button className="btn" onClick={forceAdvance}>Force Advance Turn</button>
          <button className="btn" onClick={() => socket.emit('undo')}>Undo</button>
        </div>
      </div>

      {/* State viewer */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Server State (live)</div>
        <div style={{marginBottom:8}}>Boss Damage Leaderboard:</div>
        <div style={{marginBottom:8}}>
          {st?.players?.slice()?.sort((a,b)=> (b.damageDealt||0)-(a.damageDealt||0)).map((p,i)=> (
            <div key={i}>{i+1}. {p.name} — {p.damageDealt||0} dmg</div>
          ))}
        </div>
        <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto' }}>
          {st ? JSON.stringify(st, null, 2) : 'Connecting...'}
        </pre>
      </div>
    </div>
  );
}
