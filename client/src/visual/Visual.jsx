// client/src/visual/Visual.jsx
import React, { useEffect, useState } from "react";
import { useGame } from "../state/GameContext";
import { motion, AnimatePresence } from "framer-motion";

// Example team colors
const TEAM_COLORS = {
  "Team A": "#e74c3c",
  "Team B": "#3498db",
  "Team C": "#2ecc71",
  "Team D": "#f1c40f",
  "Team E": "#f10fdeff",
};

export default function Visual() {
  const g = useGame();
  const st = g.state;

  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [lastWinner, setLastWinner] = useState(null);
  const [attacks, setAttacks] = useState([]);
  const [shake, setShake] = useState(false);

  // --- Winner modal logic ---
  useEffect(() => {
    if (st?.winner && st.winner !== lastWinner) {
      setLastWinner(st.winner);
      setShowWinnerModal(true);
    }
    if (!st?.winner && lastWinner) {
      setLastWinner(null);
      setShowWinnerModal(false);
    }
  }, [st, lastWinner]);

  // --- Watch for attacks ---
  useEffect(() => {
    if (!st) return;
    if (st.lastAction && st.lastAction.type === "attack") {
      const action = st.lastAction;
      const id = Date.now();

      setAttacks((prev) => [
        ...prev,
        {
          id,
          attackerName: action.attacker,
          targetName: action.target,
          damage: action.damage,
          effect: action.effect || "slash",
        },
      ]);

      setShake(true);
      setTimeout(() => setShake(false), 200);

      setTimeout(() => {
        setAttacks((prev) => prev.filter((a) => a.id !== id));
      }, 800);
    }
  }, [st?.lastAction]);

  if (!st) return <div className="container">Connecting to server...</div>;

  const leaderboard = [...(st.players || [])]
    .map((p, i) => ({ ...p, index: i }))
    .sort((a, b) => (b.damageDealt || 0) - (a.damageDealt || 0));

  const getTargetPosition = (name) => {
    const el = document.getElementById(`target-${name}`);
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  const getAttackerPosition = (name) => {
    const el = document.getElementById(`target-${name}`);
    if (!el) return { x: 50, y: window.innerHeight - 50 };
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top - 10 };
  };

  return (
    <div
      className="container"
      style={{
        position: "relative",
        overflow: "hidden",
        width: "100%",
        minHeight: "100vh",
        padding: 12,
        transform: shake ? "translateX(-5px)" : "translateX(0)",
        transition: "transform 0.05s",
      }}
    >
      {/* Boss HP and Image */}
      <div
        className="boss-card"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 18 }}>{st.boss.name}</div>
        <img
          src="/images/riddlebeast-idle.png"
          alt="Boss"
          style={{ margin: 8, objectFit: "contain" }}
        />
        <div className="hpbar" style={{ width: "80%", height: 16, marginBottom: 8 }}>
          <motion.div
            className="hpfill"
            style={{ width: (st.boss.hp / st.boss.maxHp) * 100 + "%" }}
            transition={{ duration: 0.5 }}
            animate={{
              backgroundColor: attacks.some((a) => a.targetName === st.boss.name)
                ? ["#f00", "#ff0", "#f00"]
                : "#e74c3c",
            }}
          />
        </div>
        <div className="muted">
          HP: {st.boss.hp}/{st.boss.maxHp}
        </div>
      </div>

      {/* Players HP Bars (near POV) */}
      <div className="players-row" style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
      {st.players.map((p, idx) => (
        <div
          key={idx}
          className="player-card"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: 120,
            padding: 8,
            borderRadius: 8,
            background: "#222",
            color: "#fff",
          }}
        >
          <img
            src={p.avatar || "/images/default-avatar.png"} // placeholder icon
            alt={p.name}
            style={{ width: 48, height: 48, borderRadius: "50%", marginBottom: 4 }}
          />
          <div
            style={{
              fontWeight: 700,
              color: TEAM_COLORS[p.team] || "#fff", // <-- applies team color
            }}
          >
            {p.name}
          </div>
          <div className="hpbar" id={`target-${p.name}`} style={{ width: "100%", height: 12, marginTop: 4 }}>
            <motion.div
              className="hpfill"
              style={{ width: (p.hp / p.maxHp) * 100 + "%" }}
              transition={{ duration: 0.5 }}
              animate={{
                backgroundColor: attacks.some((a) => a.targetName === p.name)
                  ? ["#f00", "#ff0", "#f00"]
                  : "#2ecc71",
              }}
            />
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            HP: {p.hp}/{p.maxHp}
          </div>
        </div>
      ))}

      </div>

      {/* Turn Info */}
      <div style={{ marginTop: 24, textAlign: "center", fontWeight: 700 }}>
        Turn:{" "}
        {st.players[st.currentPlayerIndex]
          ? st.players[st.currentPlayerIndex].name
          : "—"}
      </div>

      {/* Leaderboard */}
      <div className="card" style={{ marginTop: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Leaderboard</div>
        <AnimatePresence>
          {leaderboard.map((p, i) => (
            <motion.div
              key={p.index}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="player-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: 4,
                fontWeight: 700,
                color: TEAM_COLORS[p.team] || "#fff", // <-- applies team color
              }}
            >
              <div>
                #{i + 1} {p.name}
              </div>
              <div className="muted">Damage: {p.damageDealt || 0}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Attack Animations */}
      <AnimatePresence>
        {attacks.map((atk) => {
          const attackerPos = getAttackerPosition(atk.attackerName);
          const targetPos = getTargetPosition(atk.targetName);

          const targetEl = document.getElementById(`target-${atk.targetName}`);

          return (
            <React.Fragment key={atk.id}>
              {/* Slash / Fireball / Boss AoE projectile */}
              {atk.effect === "slash" || atk.effect === "fireball" ? (
                <motion.div
                  initial={{ x: attackerPos.x, y: attackerPos.y, opacity: 1 }}
                  animate={{ x: targetPos.x, y: targetPos.y, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6 }}
                  style={{ position: "fixed", pointerEvents: "none", zIndex: 1000 }}
                >
                  <div
                    style={{
                      width: atk.effect === "slash" ? 80 : 24,
                      height: atk.effect === "slash" ? 12 : 24,
                      borderRadius: atk.effect === "slash" ? 6 : "50%",
                      background:
                        atk.effect === "slash"
                          ? "linear-gradient(90deg, red, yellow)"
                          : "orange",
                      filter: atk.effect === "slash" ? "blur(4px)" : "none",
                      boxShadow: atk.effect === "fireball" ? "0 0 12px orange, 0 0 24px red" : "",
                    }}
                  />
                </motion.div>
              ) : null}

              {/* Boss AoE effect */}
              {atk.effect === "bossAoE" && targetEl && (
                <motion.img
                  src="/images/riddlebeast-idle.png"
                  alt="Boss AoE"
                  style={{
                    position: "fixed",
                    width: 100,
                    height: 100,
                    left: targetPos.x,
                    top: targetPos.y,
                    transform: "translate(-50%, -50%)",
                    zIndex: 1000,
                  }}
                  initial={{ scale: 1, rotate: 0, opacity: 1 }}
                  animate={{
                    scale: [1, 1.4, 1.2],
                    rotate: [0, 10, -10, 0],
                    opacity: [1, 0.8, 1],
                  }}
                  transition={{ duration: 0.8 }}
                />
              )}

              {/* Damage numbers */}
              <motion.div
                style={{
                  position: "absolute",
                  top: targetPos.y - 20,
                  left: targetPos.x - 10,
                  fontWeight: "bold",
                  color: "white",
                  textShadow: "0 0 8px red",
                  pointerEvents: "none",
                  zIndex: 1100,
                }}
                animate={{ y: targetPos.y - 60, opacity: 0 }}
                transition={{ duration: 0.6 }}
              >
                -{atk.damage}
              </motion.div>
            </React.Fragment>
          );
        })}
      </AnimatePresence>

      {/* Winner Modal */}
      {showWinnerModal && st.winner && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowWinnerModal(false)}
        >
          <div
            className="modal-content"
            style={{
              background: "white",
              padding: 24,
              borderRadius: 8,
              minWidth: 300,
              textAlign: "center",
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