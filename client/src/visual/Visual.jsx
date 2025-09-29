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

const slashAudio = new Audio("/sfx/player-attack.mp3");
const bossAoEAudio = new Audio("/sfx/riddlebeast-claw-attack.mp3");
const bossRoarAudio = new Audio("/sfx/riddlebeast-roar.mp3");
const abilityCastAudio = new Audio("/sfx/ability-cast.mp3");
const healAudio = new Audio("/sfx/heal.mp3");
const reviveAudio = new Audio("/sfx/revive.mp3");

const bgmAudio = new Audio("/bgm/boss-okay-bgm.mp3");
const bossLowHpAudio = new Audio("/bgm/boss-near-death.mp3");
const victoryAudio = new Audio("/bgm/player-victory.mp3");
victoryAudio.loop = false;
victoryAudio.volume = 0;

const fadeAudio = (audio, toVolume = 1, duration = 1000) => {
  if (!audio) return;
  const steps = 20;
  const stepTime = duration / steps;
  const volumeStep = (toVolume - audio.volume) / steps;
  let currentStep = 0;

  const fadeInterval = setInterval(() => {
    currentStep++;
    audio.volume = Math.min(Math.max(audio.volume + volumeStep, 0), 1);
    if (currentStep >= steps) clearInterval(fadeInterval);
  }, stepTime);
};

export default function Visual() {
  const g = useGame();
  const st = g.state;

  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [lastWinner, setLastWinner] = useState(null);
  const [attacks, setAttacks] = useState([]);
  const [effects, setEffects] = useState([]);
  const [shake, setShake] = useState(false);
  const [bossInvisible, setBossInvisible] = useState(false);
  const [bossRoared, setBossRoared] = useState(false);
  const [intenseBgmStarted, setIntenseBgmStarted] = useState(false);
  const [victoryBgmStarted, setVictoryBgmStarted] = useState(false);

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

  // --- Watch for attacks and abilities ---
  useEffect(() => {
    if (!st || !st.lastAction) return;

    const action = st.lastAction;
    const id = Date.now() + Math.random();

    if (action.type === "attack") {
      if (action.effect === "bossAoE") {
        bossAoEAudio.currentTime = 0;
        bossAoEAudio.play();
      } else {
        slashAudio.currentTime = 0;
        slashAudio.play();
      }
      
      if (action.lifestealAmount) {
        healAudio.currentTime = 0;
        healAudio.play();
      }
      if (action.resurrected) {
        reviveAudio.currentTime = 0;
        reviveAudio.play();
      }

      setAttacks((prev) => [ ...prev, { id, ...action } ]);
      setShake(true);
      setTimeout(() => setShake(false), 200);

      setTimeout(() => { setAttacks((prev) => prev.filter((a) => a.id !== id)); }, 800);
    } else if (action.type === "ability" || action.type === "info") {
        abilityCastAudio.currentTime = 0;
        abilityCastAudio.play();
        setEffects(prev => [...prev, { id, ...action }]);
        setTimeout(() => { setEffects(prev => prev.filter(e => e.id !== id))}, 1000);
    }
  }, [st?.lastAction]);

  // boss disappears during bossAoe attacks
  useEffect(() => {
    const bossAoEActive = attacks.some((a) => a.effect === "bossAoE");
    if (bossAoEActive) {
      setBossInvisible(true);
      const timer = setTimeout(() => setBossInvisible(false), 250); 
      return () => clearTimeout(timer);
    }
  }, [attacks]);

  useEffect(() => {
    const unlockAudio = () => {
      slashAudio.play().catch(() => {});
      slashAudio.pause();
      slashAudio.currentTime = 0;

      bossAoEAudio.play().catch(() => {});
      bossAoEAudio.pause();
      bossAoEAudio.currentTime = 0;
      
      abilityCastAudio.play().catch(()=>{});
      abilityCastAudio.pause();
      abilityCastAudio.currentTime = 0;

      window.removeEventListener("click", unlockAudio);
    };
    window.addEventListener("click", unlockAudio);
  }, []);

  useEffect(() => {
    const bossAoEActive = attacks.some((a) => a.effect === "bossAoE");
    if (bossAoEActive) {
      // Play roar once at the start of AoE
      if (!bossRoared) {
        bossRoarAudio.currentTime = 0;
        bossRoarAudio.play().catch(() => {});
        setBossRoared(true);
      }

      setBossInvisible(true);
      const timer = setTimeout(() => setBossInvisible(false), 250); 
      return () => clearTimeout(timer);
    } else {
      // Reset roar state when no AoE is active
      setBossRoared(false);
    }
  }, [attacks, bossRoared]);

  useEffect(() => {
    bgmAudio.loop = true;
    bossLowHpAudio.loop = true;
    const playBGM = () => {
      bgmAudio.play().catch(() => {});
      window.removeEventListener("click", playBGM);
    };

    // Some browsers block autoplay, so unlock with user interaction
    window.addEventListener("click", playBGM);

    return () => {
      bgmAudio.pause();
      bgmAudio.currentTime = 0;
      window.removeEventListener("click", playBGM);
    };
  }, []);

  useEffect(() => {
    if (!st?.boss) return;

    const bossHpPercent = st.boss.hp / st.boss.maxHp;

    // Switch to intense BGM below 50%
    if (bossHpPercent <= 0.5 && !intenseBgmStarted) {
      setIntenseBgmStarted(true);
      fadeAudio(bgmAudio, 0, 1000);
      bossLowHpAudio.currentTime = 0;
      bossLowHpAudio.play().catch(() => {});
      fadeAudio(bossLowHpAudio, 1, 1000);
    }

    // Boss defeated → victory music
    if (st.boss.hp <= 0 && !victoryBgmStarted) {
      setVictoryBgmStarted(true);
      fadeAudio(bgmAudio, 0, 500);
      fadeAudio(bossLowHpAudio, 0, 500);

      victoryAudio.currentTime = 0;
      victoryAudio.play().catch(() => {});
      fadeAudio(victoryAudio, 1, 1000);
    }
  }, [st?.boss?.hp, intenseBgmStarted, victoryBgmStarted]);

  if (!st) return <div className="container">Connecting to server...</div>;

  const leaderboard = [...(st.players || [])]
    .map((p, i) => ({ ...p, index: i }))
    .sort((a, b) => (b.damageDealt || 0) - (a.damageDealt || 0));

  const getTargetPosition = (name) => {
    if (!name) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const el = document.getElementById(`target-${name}`);
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  const getAttackerPosition = (name) => {
    if (!name) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const el = document.getElementById(`target-${name}`);
    if (!el) return { x: 50, y: window.innerHeight - 50 };
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top - 10 };
  };

  const StatusEffectIcons = ({ effects }) => {
    if (!effects?.length) return null;
    return (
      <div style={{ display: 'flex', gap: 4, marginTop: 4, height: 16, alignItems: 'center', justifyContent: 'center' }}>
        {effects.map(effect => {
          let icon = '?';
          if (effect.type === 'stunned') icon = '😵';
          if (effect.type === 'disarmed') icon = '⚔️🚫';
          if (effect.type === 'resurrection') icon = '👼';
          if (effect.type === 'redirect') icon = '↩️';
          if (effect.type === 'damageBoost') icon = '🔥';
          if (effect.type === 'lifesteal') icon = '🩸';
          return <span key={effect.type} title={effect.type} style={{ fontSize: 14 }}>{icon}</span>;
        })}
      </div>
    );
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
        id={`target-${st.boss.name}`}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 18 }}>{st.boss.name}</div>

        <motion.img
          src="/images/riddlebeast-idle.png"
          alt="Boss"
          style={{
            margin: 8,
            objectFit: "contain",
            position: "relative",
            zIndex: 500,
          }}
          animate={{
            y: attacks.some((a) => a.effect === "bossAoE") ? 400 : 0,
            scale: attacks.some((a) => a.effect === "bossAoE") ? 2 : 1,
            opacity: bossInvisible ? 0 : 1,
          }}
          transition={{
            y: { duration: 0.05, ease: "easeInOut" },
            scale: { duration: 0.05, ease: "easeInOut" },
            opacity: { duration: 0.05, ease: "easeInOut" },
          }}
        />

        <div className="hpbar" style={{ width: "80%", height: 16, marginBottom: 8 }}>
          <motion.div
            className="hpfill"
            style={{ width: (st.boss.hp / st.boss.maxHp) * 100 + "%" }}
            transition={{ duration: 0.5 }}
            animate={{
              backgroundColor: attacks.some((a) => a.target === st.boss.name)
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
          id={`target-${p.name}`}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: 120,
            padding: 8,
            borderRadius: 8,
            background: "#222",
            color: "#fff",
            opacity: p.hp <= 0 ? 0.5 : 1,
            border: st.currentPlayerIndex === idx ? '2px solid yellow' : '2px solid transparent',
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
          <StatusEffectIcons effects={p.statusEffects} />
          <div className="hpbar" style={{ width: "100%", height: 12, marginTop: 4 }}>
            <motion.div
              className="hpfill"
              style={{ width: (p.hp / p.maxHp) * 100 + "%" }}
              transition={{ duration: 0.5 }}
              animate={{
                backgroundColor: attacks.some((a) => a.target === p.name)
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

      {/* Attack & Effect Animations */}
      <AnimatePresence>
        {attacks.map((atk) => {
          const targetPos = getTargetPosition(atk.target);
          return (
            <React.Fragment key={atk.id}>
              {atk.effect === "slash" && (
                <motion.img src="/images/player-attack.gif" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ position: "fixed", top: targetPos.y-40, left: targetPos.x-40, pointerEvents: "none", zIndex: 1000, width: 80, height: 80 }}
                />
              )}
              {atk.effect === "bossAoE" && (
                <motion.img src="/images/riddlebeast-claw-attack.png"
                  style={{ position: "fixed", width: 100, height: 100, left: targetPos.x, top: targetPos.y - 200, transform: "translate(-50%, -50%)", zIndex: 1000, filter: "drop-shadow(0 0 10px rgba(255,0,0,0.7))" }}
                  initial={{ y: 0, opacity: 1 }} animate={{ y: 250, opacity: [1, 0.8, 0] }} transition={{ duration: 0.25, ease: "easeIn" }}
                />
              )}
              { atk.damage > 0 && (
                <motion.div style={{ position: "absolute", top: targetPos.y - 35, left: targetPos.x, fontWeight: "bold", fontSize: 36, color: "white", textShadow: `0 0 8px red, 0 0 12px orange`, pointerEvents: "none", zIndex: 1100, transform: "translate(-50%, -50%)" }}
                  initial={{ scale: 0, opacity: 1 }} animate={{ y: [0, -60], scale: [0, 1.5, 1.2], opacity: [1, 1, 0] }} transition={{ duration: 0.75, ease: "easeOut" }} >
                  -{atk.damage}
                </motion.div>
              )}
              { atk.lifestealAmount > 0 && (
                 <motion.div style={{ position: "absolute", top: getAttackerPosition(atk.attacker).y - 35, left: getAttackerPosition(atk.attacker).x, fontWeight: "bold", fontSize: 28, color: "lime", textShadow: `0 0 8px green`, pointerEvents: "none", zIndex: 1100, transform: "translate(-50%, -50%)" }}
                 initial={{ scale: 0, opacity: 1 }} animate={{ y: [0, -40], scale: [0, 1.2], opacity: [1, 1, 0] }} transition={{ duration: 0.75, ease: "easeOut" }} >
                 +{atk.lifestealAmount}
               </motion.div>
              )}
              { atk.resurrected && (
                 <motion.div style={{ position: "absolute", top: targetPos.y, left: targetPos.x, fontWeight: "bold", fontSize: 24, color: "gold", textShadow: `0 0 8px white`, pointerEvents: "none", zIndex: 1100, transform: "translate(-50%, -50%)" }}
                 initial={{ scale: 0, opacity: 1 }} animate={{ y: [0, -50], scale: [0, 1.3], opacity: [1, 1, 0] }} transition={{ duration: 0.9, ease: "easeOut" }} >
                 REVIVED!
               </motion.div>
              )}
            </React.Fragment>
          );
        })}
        {effects.map((effect) => {
            const targetPos = getTargetPosition(effect.targetName);
            return (
                <motion.div key={effect.id}
                    style={{ position: 'absolute', top: targetPos.y, left: targetPos.x, fontWeight: 'bold', fontSize: 24, color: '#88aaff', textShadow: '0 0 8px blue', pointerEvents: 'none', zIndex: 1100, transform: 'translate(-50%, -50%)' }}
                    initial={{ scale: 0, opacity: 1 }} animate={{ y: [0, -50], scale: [0, 1.2], opacity: [1, 0] }} transition={{ duration: 1, ease: 'easeOut' }}>
                    {effect.abilityName || effect.message}
                </motion.div>
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
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(4px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 2000,
          }}
          onClick={() => setShowWinnerModal(false)}
        >
          <motion.div
            className="modal-content"
            style={{
              background: "linear-gradient(135deg, #f9d423, #ff4e50)",
              padding: 32,
              borderRadius: 16,
              minWidth: 350,
              textAlign: "center",
              boxShadow: "0 0 20px rgba(255, 255, 255, 0.5)",
              border: "2px solid gold",
              position: "relative",
              overflow: "hidden",
            }}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Confetti circles */}
            {Array.from({ length: 30 }).map((_, i) => (
              <motion.div
                key={i}
                style={{
                  position: "absolute",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: ["#fff", "#ffd700", "#ff4500"][i % 3],
                  top: Math.random() * 100 + "%",
                  left: Math.random() * 100 + "%",
                }}
                animate={{ y: [0, 300], opacity: [1, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: Math.random() }}
              />
            ))}

            <h2 style={{
              fontSize: 32,
              fontWeight: "900",
              color: "#fff",
              textShadow: "0 0 10px #fff, 0 0 20px gold, 0 0 30px orange",
            }}>Winner</h2>

            <p style={{
              fontWeight: 900,
              fontSize: 28,
              margin: "12px 0",
              color: "#fff",
              textShadow: "0 0 8px #fff, 0 0 12px #ff0, 0 0 16px #f00",
            }}>
              {st.winner}
            </p>

            <p style={{
              fontStyle: "italic",
              fontWeight: 700,
              fontSize: 16,
              color: "#fff",
              marginBottom: 16,
              textShadow: "0 0 6px #000",
            }}>
              You deserved this victory!
            </p>

            <motion.button
              className="btn"
              style={{
                marginTop: 8,
                padding: "8px 20px",
                fontWeight: 700,
                fontSize: 16,
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                background: "#fff",
                color: "#ff4e50",
                boxShadow: "0 0 10px rgba(255, 0, 0, 0.5)",
              }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowWinnerModal(false)}
            >
              Close
            </motion.button>
          </motion.div>
        </div>
      )}
    </div>
  );
}