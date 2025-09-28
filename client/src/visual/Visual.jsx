// client/src/visual/Visual.jsx
import React, { useEffect, useState } from 'react';
import { useGame } from '../state/GameContext';
import { motion } from 'framer-motion';

export default function Visual() {
  const g = useGame();
  const st = g.state;
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [lastWinner, setLastWinner] = useState(null);

  // --- FIX IS HERE ---
  // Watch the entire 'st' object for changes.
  useEffect(() => {
    // This logic is fine, it just needs to be triggered reliably.
    if (st?.winner && st.winner !== lastWinner) {
      setLastWinner(st.winner);
      setShowWinnerModal(true);
    }
    // If the game resets and the winner is cleared, reset our local state too.
    if (!st?.winner && lastWinner) {
      setLastWinner(null);
      setShowWinnerModal(false);
    }
  }, [st, lastWinner]); // Dependency array changed to [st, lastWinner]

  if (!st) return <div className="container">Connecting to server...</div>;

  // Build leaderboard (no changes here)
  const leaderboard = [...(st.players || [])]
    .map((p, i) => ({ ...p, index: i }))
    .sort((a, b) => (b.damageDealt || 0) - (a.damageDealt || 0));

  return (
    <div className="container">
      {/* Board, Players, Turn, Leaderboard sections remain unchanged */}
      <div className="board">
        {/* Boss */}
        <div className="card" style={{ flex: 1 }}>
          <div className="boss">
            {st.boss.name} — HP: {st.boss.hp}/{st.boss.maxHp}
          </div>
          <div className="hpbar">
            <motion.div
              className="hpfill"
              style={{ width: (st.boss.hp / st.boss.maxHp) * 100 + '%' }}
            />
          </div>
        </div>

        {/* Players */}
        <div className="card" style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Players (Round {st.round})
          </div>
          {st.players.map((p, idx) => (
            <div key={idx} className="player-row">
              <div style={{ width: 140 }}>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div className="hpbar">
                  <motion.div
                    className="hpfill"
                    style={{ width: (p.hp / p.maxHp) * 100 + '%' }}
                  />
                </div>
              </div>
              <div className="muted">
                HP: {p.hp}/{p.maxHp}
              </div>
            </div>
          ))}
        </div>

        {/* Turn */}
        <div className="card" style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Turn</div>
          <div>
            {st.players[st.currentPlayerIndex]
              ? st.players[st.currentPlayerIndex].name
              : '—'}
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Leaderboard</div>
        {leaderboard.map((p, i) => (
          <div key={p.index} className="player-row">
            <div style={{ fontWeight: 700 }}>
              #{i + 1} {p.name}
            </div>
            <div className="muted">
              Damage Dealt: {p.damageDealt || 0}
            </div>
          </div>
        ))}
      </div>


      {/* Winner Modal (no changes here) */}
      {showWinnerModal && st.winner && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowWinnerModal(false)}
        >
          <div
            className="modal-content"
            style={{
              background: 'white',
              padding: 24,
              borderRadius: 8,
              minWidth: 300,
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>🎉 Winner 🎉</h2>
            <p style={{ fontWeight: 700, fontSize: 20 }}>{st.winner}</p>
            <button
              className="btn"
              style={{ marginTop: 12 }}
              onClick={() => setShowWinnerModal(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}