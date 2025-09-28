// server/index.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// ----------------------
// Game State (in-memory)
// ----------------------
const DEFAULT_PLAYER_HP = 30;
const DEFAULT_BOSS_AOE = 2;   // AoE damage when round ends
const DEFAULT_PVP_DAMAGE = 5; // flat pvp damage

let gameState = {
  players: [], // { id, name, hp, maxHp }
  boss: { name: 'Riddlebeast', hp: 75, maxHp: 75 },
  currentPlayerIndex: 0,
  round: 1,
  settings: {
    bossAoE: DEFAULT_BOSS_AOE,
    pvpDamage: DEFAULT_PVP_DAMAGE
  }
};

// ----------------------
// Helpers: state management
// ----------------------
function broadcastState() {
  io.emit('state', gameState);
}

function initGame(payload = {}) {
  const players = (payload.players || []).map((p, i) => ({
    id: i,
    name: p.name || `Player ${i}`,
    hp: DEFAULT_PLAYER_HP,
    maxHp: DEFAULT_PLAYER_HP,
    damageDealt: 0
  }));

  const bossHp = Number(payload.bossHp) || Math.max(75, 15 * Math.max(1, players.length));
  const bossName = payload.bossName || 'Riddlebeast';

  gameState.players = players;
  gameState.boss = { name: bossName, hp: bossHp, maxHp: bossHp };
  gameState.currentPlayerIndex = 0;
  gameState.round = 1;
  gameState.winner = null; // <-- NEW
}
function applyBossAoE() {
  const dmg = Number(gameState.settings.bossAoE) || DEFAULT_BOSS_AOE;
  gameState.players.forEach(p => {
    if (p.hp > 0) {
      p.hp = Math.max(0, p.hp - dmg);
    }
  });
  // optional event to animate AoE on clients
  io.emit('bossAttack', { damage: dmg, players: gameState.players });
}

function nextTurn() {
  let found = false;
  let attempts = 0;

  while (!found && attempts < gameState.players.length) {
    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1);
    if (gameState.currentPlayerIndex >= gameState.players.length) {
      // End of round → AoE + reset
      applyBossAoE();
      gameState.currentPlayerIndex = 0;
      gameState.round++;
    }

    const current = gameState.players[gameState.currentPlayerIndex];
    if (current && current.hp > 0) {
      found = true; // alive player found
    }
    attempts++;
  }

  // broadcastState();
}

// ----------------------
// Check winner
// ----------------------
function checkVictory() {
  if (gameState.boss.hp <= 0 && !gameState.winner) {
    // determine top damage dealer
    let top = null;
    for (const p of gameState.players) {
      if (!top || (p.damageDealt || 0) > (top.damageDealt || 0)) {
        top = p;
      }
    }
    gameState.winner = top ? top.name : 'Players';
    // io.emit('victory', { winner: gameState.winner });
  }
  // check if all players dead -> boss wins
  if (gameState.players.length > 0 && gameState.players.every(p => p.hp <= 0) && !gameState.winner) {
    gameState.winner = gameState.boss.name;
    // io.emit('victory', { winner: gameState.winner });
  }
  // Optional: check if all players are dead -> boss wins
  // if (gameState.players.every(p => p.hp <= 0) && !gameState.winner) {
  //   gameState.winner = 'Riddlebeast';
  //   io.emit('victory', { winner: gameState.winner });
  // }
}

// ----------------------
// Actions processing
// ----------------------
function _handlePlayerAction({ playerId, action, value, target }) {
  // Validate current player
  if (typeof playerId !== 'number' || !gameState.players[playerId]) {
    return { ok: false, reason: 'invalid-player' };
  }
  const current = gameState.currentPlayerIndex;
  if (playerId !== current) {
    // enforce turn order: only current player can act
    return { ok: false, reason: 'not-your-turn', expected: current };
  }

  const actingPlayer = gameState.players[playerId];
  if (actingPlayer.hp <= 0) {
    return { ok: false, reason: 'player-dead' };
  }

  switch (action) {
    case 'attackBoss': {
      const dmg = Number(value) || 0;
      gameState.boss.hp = Math.max(0, gameState.boss.hp - dmg);
      if (gameState.players[playerId]) {
        gameState.players[playerId].damageDealt = (gameState.players[playerId].damageDealt || 0) + dmg;
      }
      break;
    }
    case 'attackPlayer': {
      // target should be player index
      const t = Number(target);
      if (isNaN(t) || !gameState.players[t]) return { ok: false, reason: 'invalid-target' };
      if (gameState.players[t].hp <= 0) return { ok: false, reason: 'target-dead' };
      const dmg = Number(value) || 0; // full value on rival attack
      gameState.players[t].hp = Math.max(0, gameState.players[t].hp - dmg);
      break;
    }
    case 'selfDamage':
    case 'wrongAnswer': {
      // self damage is half the chosen question value (rounded up)
      const raw = Number(value) || 0;
      const dmg = Math.ceil(raw / 2);
      gameState.players[playerId].hp = Math.max(0, gameState.players[playerId].hp - dmg);
      break;
    }
    default:
      return { ok: false, reason: 'unknown-action' };
  }

  // After processing a valid action, advance turn
  nextTurn();
  return { ok: true };
}

function handlePlayerAction(payload) {
  const result = _handlePlayerAction(payload);
  checkVictory();
  broadcastState();
  return result;
}

// ----------------------
// Socket.io
// ----------------------
io.on('connection', socket => {
  console.log('socket connected', socket.id);

  // Send the current state initially
  socket.emit('state', gameState);

  // INIT game from host
  socket.on('initGame', payload => {
    try {
      initGame(payload || {});
      broadcastState();
      console.log('Game initialized with', gameState.players.length, 'players. Boss HP:', gameState.boss.hp);
    } catch (err) {
      console.error('initGame error', err);
    }
  });

  // Generic playerAction from control UI (preferred)
  socket.on('playerAction', (payload) => {
    try {
      // payload: { playerId, action, value, target }
      const result = handlePlayerAction(payload || {});
      if (!result.ok) {
        socket.emit('actionRejected', result);
      } else {
        // broadcast done inside nextTurn()
      }
    } catch (err) {
      console.error('playerAction error', err);
      socket.emit('actionRejected', { ok: false, reason: 'server-error' });
    }
  });

  // Backwards-compat: keep older event names used by earlier scaffold
  socket.on('action:correctAnswer', ({ playerIndex, value, target }) => {
    // target may be 'boss' or { type: 'player', index: n }
    const playerId = Number(playerIndex);
    if (target === 'boss') {
      handlePlayerAction({ playerId, action: 'attackBoss', value });
    } else if (target && target.type === 'player') {
      handlePlayerAction({ playerId, action: 'attackPlayer', value, target: target.index });
    }
  });

  socket.on('action:wrongAnswer', ({ playerIndex, value }) => {
    handlePlayerAction({ playerId: Number(playerIndex), action: 'wrongAnswer', value });
  });

  // PvP resolution (flat pvp damage)
  socket.on('action:pvpResult', ({ challengerIndex, opponentIndex, opponentSucceeded }) => {
    try {
      const dmg = Number(gameState.settings.pvpDamage) || DEFAULT_PVP_DAMAGE;
      if (opponentSucceeded) {
        // challenger takes dmg
        if (gameState.players[challengerIndex]) {
          gameState.players[challengerIndex].hp = Math.max(0, gameState.players[challengerIndex].hp - dmg);
        }
      } else {
        // opponent takes dmg
        if (gameState.players[opponentIndex]) {
          gameState.players[opponentIndex].hp = Math.max(0, gameState.players[opponentIndex].hp - dmg);
        }
      }
      broadcastState();
    } catch (err) {
      console.error('action:pvpResult error', err);
    }
  });

  // Host can force-end-turn / advance (compatibility)
  socket.on('action:endTurn', ({ nextTurnIndex } = {}) => {
    try {
      if (typeof nextTurnIndex === 'number') {
        // directly set current and then advance normally
        gameState.currentPlayerIndex = Number(nextTurnIndex);
      } else {
        // move to next turn (will apply AoE if cycle ends)
        gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1);
        if (gameState.currentPlayerIndex >= gameState.players.length) {
          applyBossAoE();
          gameState.currentPlayerIndex = 0;
          gameState.round++;
        }
      }
      checkVictory(); 
      broadcastState();
    } catch (err) {
      console.error('action:endTurn error', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
  });
});

// ----------------------
// Express route
// ----------------------
app.get('/', (req, res) => {
  res.send('Trivia Raid server running');
});

// ----------------------
// Start server
// ----------------------
const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
