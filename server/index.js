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
const MAX_HISTORY = 20;        // max undo history

let gameState = {
  players: [],
  boss: { name: 'Riddlebeast', hp: 75, maxHp: 75 },
  currentPlayerIndex: 0,
  round: 1,
  settings: { bossAoE: DEFAULT_BOSS_AOE, pvpDamage: DEFAULT_PVP_DAMAGE },
  winner: null,
  lastAction: null // <-- add this
};

let gameHistory = [];

// ----------------------
// History Management
// ----------------------
function saveHistory() {
  // Deep copy of state
  const snapshot = JSON.parse(JSON.stringify(gameState));
  gameHistory.push(snapshot);
  if (gameHistory.length > MAX_HISTORY) gameHistory.shift();
}

function undo() {
  if (gameHistory.length === 0) return;
  const lastState = gameHistory.pop();
  Object.assign(gameState, lastState); // keep reference
  broadcastState();
}

// ----------------------
// Helpers
// ----------------------
function broadcastState() {
  io.emit('state', gameState);
}

function initGame(payload = {}) {
  saveHistory();

  const TEAM_NAMES = ["Team A", "Team B", "Team C", "Team D", "Team E"];

  const players = (payload.players || []).map((p, i) => ({
    id: i,
    name: p.name || `Player ${i}`,
    hp: DEFAULT_PLAYER_HP,
    maxHp: DEFAULT_PLAYER_HP,
    damageDealt: 0,
    team: TEAM_NAMES[i % TEAM_NAMES.length] // <-- assign team here
  }));

  const bossHp = Number(payload.bossHp) || Math.max(75, 15 * Math.max(1, players.length));
  const bossName = payload.bossName || 'Riddlebeast';

  gameState.players = players;
  gameState.boss = { name: bossName, hp: bossHp, maxHp: bossHp };
  gameState.currentPlayerIndex = 0;
  gameState.round = 1;
  gameState.winner = null;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function applyBossAoE() {
  const dmg = Number(gameState.settings.bossAoE) || DEFAULT_BOSS_AOE;

  for (const p of gameState.players) {
    if (p.hp <= 0) continue;

    saveHistory();

    p.hp = Math.max(0, p.hp - dmg);

    gameState.lastAction = {
      type: 'attack',
      attacker: gameState.boss.name,
      target: p.name,
      damage: dmg,
      effect: 'bossAoE'
    };
    broadcastState();

    // Wait so client can see the animation
    await delay(600);  

    gameState.lastAction = null;
    broadcastState();
  }
}

async function nextTurn() {
  let found = false;
  let attempts = 0;

  while (!found && attempts < gameState.players.length) {
    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;

    if (gameState.currentPlayerIndex === 0) {
      await applyBossAoE(); // <- must await
      gameState.round++;
    }

    const current = gameState.players[gameState.currentPlayerIndex];
    if (current && current.hp > 0) found = true;

    attempts++;
  }
}

// ----------------------
// Victory check
// ----------------------
function checkVictory() {
  if (gameState.winner) return;

  if (gameState.boss.hp <= 0) {
    let top = null;
    for (const p of gameState.players) {
      if (!top || (p.damageDealt || 0) > (top.damageDealt || 0)) top = p;
    }
    gameState.winner = top?.name || 'Players';
  }

  if (gameState.players.length > 0 && gameState.players.every(p => p.hp <= 0)) {
    gameState.winner = gameState.boss.name;
  }
}

// ----------------------
// Action Processing
// ----------------------
async function _handlePlayerAction({ playerId, action, value, target }) {
  const current = gameState.currentPlayerIndex;
  if (playerId !== current) return { ok: false, reason: 'not-your-turn', expected: current };

  const actingPlayer = gameState.players[playerId];
  if (!actingPlayer || actingPlayer.hp <= 0) return { ok: false, reason: 'player-dead' };

  saveHistory(); // save BEFORE state changes

  switch (action) {
    case 'attackBoss': {
      const dmg = Number(value) || 0;
      gameState.boss.hp = Math.max(0, gameState.boss.hp - dmg);
      actingPlayer.damageDealt = (actingPlayer.damageDealt || 0) + dmg;

      gameState.lastAction = {
        type: 'attack',
        attacker: actingPlayer.name,
        target: gameState.boss.name,
        damage: dmg,
        effect: 'slash'
      };
      break;
    }
    case 'attackPlayer': {
      const t = Number(target);
      if (isNaN(t) || !gameState.players[t]) return { ok: false, reason: 'invalid-target' };
      if (gameState.players[t].hp <= 0) return { ok: false, reason: 'target-dead' };
      const dmg = Number(value) || 0;
      gameState.players[t].hp = Math.max(0, gameState.players[t].hp - dmg);

      actingPlayer.damageDealt = (actingPlayer.damageDealt || 0) + (dmg/2);
      gameState.lastAction = {
        type: 'attack',
        attacker: actingPlayer.name,
        target: gameState.players[t].name,
        damage: dmg,
        effect: 'slash'
      };
      break;
    }
    case 'selfDamage':
    case 'wrongAnswer': {
      const dmg = Math.ceil((Number(value) || 0) / 2);
      actingPlayer.hp = Math.max(0, actingPlayer.hp - dmg);

      gameState.lastAction = {
        type: 'attack',
        attacker: actingPlayer.name,
        target: actingPlayer.name,
        damage: dmg,
        effect: 'self'
      };
      break;
    }
    default: return { ok: false, reason: 'unknown-action' };
  }

  await nextTurn();
  checkVictory();
  broadcastState();
  gameState.lastAction = null;
  return { ok: true };
}

function handlePlayerAction(payload) {
  return _handlePlayerAction(payload);
}

// ----------------------
// Socket.io
// ----------------------
io.on('connection', socket => {
  console.log('socket connected', socket.id);

  socket.emit('state', gameState);

  socket.on('initGame', payload => { initGame(payload); broadcastState(); });
  socket.on('playerAction', payload => {
    const res = handlePlayerAction(payload);
    if (!res.ok) socket.emit('actionRejected', res);
  });

  socket.on('action:correctAnswer', ({ playerIndex, value, target }) => {
    const playerId = Number(playerIndex);
    if (target === 'boss') handlePlayerAction({ playerId, action: 'attackBoss', value });
    else if (target?.type === 'player') handlePlayerAction({ playerId, action: 'attackPlayer', value, target: target.index });
  });

  socket.on('action:wrongAnswer', ({ playerIndex, value }) => {
    handlePlayerAction({ playerId: Number(playerIndex), action: 'wrongAnswer', value });
  });

  socket.on('action:pvpResult', ({ challengerIndex, opponentIndex, opponentSucceeded }) => {
    saveHistory();
    const dmg = Number(gameState.settings.pvpDamage) || DEFAULT_PVP_DAMAGE;
    if (opponentSucceeded) {
      if (gameState.players[challengerIndex]) {
          gameState.players[challengerIndex].hp = Math.max(0, gameState.players[challengerIndex].hp - dmg);
          gameState.lastAction = {
            type: 'attack',
            attacker: gameState.players[opponentIndex].name,
            target: gameState.players[challengerIndex].name,
            damage: dmg,
            effect: 'slash'
          };
        }
    } else {
      if (gameState.players[opponentIndex]) {
        gameState.players[opponentIndex].hp = Math.max(0, gameState.players[opponentIndex].hp - dmg);
          gameState.lastAction = {
            type: 'attack',
            attacker: gameState.players[challengerIndex].name,
            target: gameState.players[opponentIndex].name,
            damage: dmg,
            effect: 'slash'
          };
      }
    }

    checkVictory();
    broadcastState();
    gameState.lastAction = null;
  });

  socket.on('action:endTurn', ({ nextTurnIndex } = {}) => {
    saveHistory();
    if (typeof nextTurnIndex === 'number') gameState.currentPlayerIndex = nextTurnIndex;
    else nextTurn();
    checkVictory();
    broadcastState();
  });

  socket.on('undo', () => undo());

  socket.on('disconnect', () => console.log('socket disconnected', socket.id));
});

// ----------------------
// Express route
// ----------------------
app.get('/', (req, res) => res.send('Trivia Raid server running'));

// ----------------------
// Start server
// ----------------------
const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
