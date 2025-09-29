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
// Game State & Config
// ----------------------
const DEFAULT_PLAYER_HP = 30;
const DEFAULT_BOSS_AOE = 2;
const DEFAULT_PVP_DAMAGE = 5;
const MAX_HISTORY = 20;
const RESURRECTION_HP = 10;

const ABILITIES_CONFIG = {
    'Redirect Damage': { timing: 'anytime' },
    'Disarm': { timing: 'anytime' },
    'Stun': { timing: 'anytime' },
    'Increased Damage': { timing: 'turn-only' },
    'Lifesteal': { timing: 'turn-only' },
    'Resurrection': { timing: 'passive' }
};

let gameState = {
  players: [],
  boss: { name: 'Riddlebeast', hp: 75, maxHp: 75 },
  currentPlayerIndex: 0,
  round: 1,
  settings: { bossAoE: DEFAULT_BOSS_AOE, pvpDamage: DEFAULT_PVP_DAMAGE },
  winner: null,
  lastAction: null
};

let gameHistory = [];

// ----------------------
// History & Helpers
// ----------------------
function saveHistory() {
  const snapshot = JSON.parse(JSON.stringify(gameState));
  gameHistory.push(snapshot);
  if (gameHistory.length > MAX_HISTORY) gameHistory.shift();
}

function undo() {
  if (gameHistory.length === 0) return;
  const lastState = gameHistory.pop();
  Object.assign(gameState, lastState);
  broadcastState();
}

function broadcastState() {
  io.emit('state', gameState);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ----------------------
// Core Game Logic
// ----------------------
function checkAndApplyResurrection(player) {
    if (player && player.hp <= 0) {
        const resIndex = player.abilities.indexOf('Resurrection');
        if (resIndex !== -1) {
            player.hp = RESURRECTION_HP;
            player.abilities.splice(resIndex, 1); // Consume ability
            return true; // Resurrection occurred
        }
    }
    return false;
}

function initGame(payload = {}) {
  saveHistory();

  const TEAM_NAMES = ["Team A", "Team B", "Team C", "Team D", "Team E"];
  const abilityAssignments = payload.abilityAssignments || {};

  const players = (payload.players || []).map((p, i) => {
    const team = TEAM_NAMES[i % TEAM_NAMES.length];
    const assignedAbility = abilityAssignments[team];
    return {
        id: i,
        name: p.name || `Player ${i}`,
        hp: DEFAULT_PLAYER_HP,
        maxHp: DEFAULT_PLAYER_HP,
        damageDealt: 0,
        team: team,
        abilities: assignedAbility ? [assignedAbility] : [],
        statusEffects: []
    };
  });

  const bossHp = Number(payload.bossHp) || Math.max(75, 15 * Math.max(1, players.length));
  const bossName = payload.bossName || 'Riddlebeast';

  gameState.players = players;
  gameState.boss = { name: bossName, hp: bossHp, maxHp: bossHp };
  gameState.currentPlayerIndex = 0;
  gameState.round = 1;
  gameState.winner = null;
}

async function applyBossAoE() {
  const dmg = Number(gameState.settings.bossAoE) || DEFAULT_BOSS_AOE;

  for (const p of gameState.players) {
    if (p.hp <= 0) continue;
    saveHistory();
    
    p.hp = Math.max(0, p.hp - dmg);
    const resurrected = checkAndApplyResurrection(p);

    gameState.lastAction = {
      type: 'attack',
      attacker: gameState.boss.name,
      target: p.name,
      damage: dmg,
      effect: 'bossAoE',
      resurrected: resurrected,
    };
    broadcastState();

    await delay(600);
    gameState.lastAction = null;
    broadcastState();
  }
}

async function nextTurn() {
  const prevIndex = gameState.currentPlayerIndex;
  const isLastPlayerInList = prevIndex === gameState.players.length - 1;

  let found = false;
  let attempts = 0;
  let currentIndex = prevIndex;

  while (!found && attempts < gameState.players.length * 2) {
    currentIndex = (currentIndex + 1) % gameState.players.length;
    const nextPlayer = gameState.players[currentIndex];
    attempts++;

    if (nextPlayer && nextPlayer.hp > 0) {
      const stunEffect = nextPlayer.statusEffects.find(e => e.type === 'stunned');
      if (stunEffect) {
        saveHistory();
        nextPlayer.statusEffects = nextPlayer.statusEffects.filter(e => e.type !== 'stunned');
        gameState.lastAction = {
          type: 'info',
          message: `${nextPlayer.name}'s turn skipped (Stunned)`,
          targetName: nextPlayer.name,
          effect: 'stunned'
        };
        broadcastState();
        await delay(800);
        gameState.lastAction = null;
      } else {
        found = true;
        gameState.currentPlayerIndex = currentIndex;
      }
    }
  }

  if (gameState.boss.hp <= 0 || gameState.winner) return;
  if (gameState.currentPlayerIndex < prevIndex || (isLastPlayerInList && gameState.currentPlayerIndex === 0)) {
    await delay(300);
    await applyBossAoE();
    gameState.round++;
  }
}

function checkVictory() {
  if (gameState.winner) return;
  if (gameState.boss.hp <= 0) {
    let top = null;
    for (const p of gameState.players) {
      if (!top || (p.damageDealt || 0) > (top.damageDealt || 0)) {
        top = p;
      }
    }
    gameState.winner = top?.name || 'Players';
    return;
  }

  if (gameState.players.length > 0 && gameState.players.every(p => p.hp <= 0)) {
    gameState.winner = gameState.boss.name;
    return;
  }

  const alivePlayers = gameState.players.filter(p => p.hp > 0);
  if (alivePlayers.length === 1) {
    let top = null;
    for (const p of gameState.players) {
      if (!top || (p.damageDealt || 0) > (top.damageDealt || 0)) {
        top = p;
      }
    }
    gameState.winner = top?.name || alivePlayers[0].name;
    return;
  }
}

async function handlePlayerAction({ playerId, action, value, target }) {
  const current = gameState.currentPlayerIndex;
  if (playerId !== current) return { ok: false, reason: 'not-your-turn', expected: current };

  const actingPlayer = gameState.players[playerId];
  if (!actingPlayer || actingPlayer.hp <= 0) return { ok: false, reason: 'player-dead' };

  saveHistory(); // save BEFORE state changes
  let lastActionObj = {};

  const disarmEffect = actingPlayer.statusEffects.find(e => e.type === 'disarmed');
  if (disarmEffect) {
    // Always remove disarm if the player takes an offensive or self action
    if (['attackBoss', 'attackPlayer', 'selfDamage', 'wrongAnswer'].includes(action)) {
      actingPlayer.statusEffects = actingPlayer.statusEffects.filter(e => e.type !== 'disarmed');

      // If it's attackBoss or attackPlayer → block damage (return early)
      if (action === 'attackBoss' || action === 'attackPlayer') {
        lastActionObj = {
          type: 'attack',
          attacker: actingPlayer.name,
          target: action === 'attackBoss'
            ? gameState.boss.name
            : gameState.players[target].name,
          damage: 0,
          effect: 'disarmed'
        };
        gameState.lastAction = lastActionObj;
        broadcastState();
        await delay(400);
        gameState.lastAction = null;
        await nextTurn();
        checkVictory();
        broadcastState();
        return { ok: true };
      }

      // If it's selfDamage/wrongAnswer → continue to damage handling below
    }
  }

  let baseDmg = Number(value) || 0;
  
  const boostEffect = actingPlayer.statusEffects.find(e => e.type === 'damageBoost');
  if (boostEffect) {
    baseDmg = Math.round(baseDmg * boostEffect.multiplier);
    actingPlayer.statusEffects = actingPlayer.statusEffects.filter(e => e.type !== 'damageBoost');
  }

  switch (action) {
    case 'attackBoss': {
      const originalHp = gameState.boss.hp;
      gameState.boss.hp = Math.max(0, gameState.boss.hp - baseDmg);
      const actualDamage = originalHp - gameState.boss.hp;
      actingPlayer.damageDealt = (actingPlayer.damageDealt || 0) + actualDamage;
      lastActionObj = { type: 'attack', attacker: actingPlayer.name, target: gameState.boss.name, damage: actualDamage, effect: 'slash' };
      break;
    }
    case 'attackPlayer': {
      let targetPlayer = gameState.players[Number(target)];
      if (!targetPlayer || targetPlayer.hp <= 0) return { ok: false, reason: 'invalid-target' };
      
      let redirectedFrom = null;
      const redirectEffect = targetPlayer.statusEffects.find(e => e.type === 'redirect');
      if (redirectEffect) {
        redirectedFrom = targetPlayer.name;
        targetPlayer.statusEffects = targetPlayer.statusEffects.filter(e => e.type !== 'redirect');
        if (redirectEffect.target === 'boss') {
          const originalBossHp = gameState.boss.hp;
          gameState.boss.hp = Math.max(0, gameState.boss.hp - baseDmg);
          actingPlayer.damageDealt += originalBossHp - gameState.boss.hp;
          targetPlayer = gameState.boss; // For lastAction
        } else if (gameState.players[redirectEffect.target]) {
          targetPlayer = gameState.players[redirectEffect.target];
        }
      }

      const originalHp = targetPlayer.hp;
      targetPlayer.hp = Math.max(0, targetPlayer.hp - baseDmg);
      const actualDamage = originalHp - targetPlayer.hp;
      
      if (targetPlayer.name !== gameState.boss.name) {
        actingPlayer.damageDealt += Math.floor(actualDamage / 2);
      }
      
      const resurrected = checkAndApplyResurrection(targetPlayer);

      lastActionObj = { type: 'attack', attacker: actingPlayer.name, target: targetPlayer.name, damage: actualDamage, effect: 'slash', redirectedFrom, resurrected };
      break;
    }
    case 'selfDamage':
    case 'wrongAnswer': {
      const dmg = Math.ceil(baseDmg / 2);
      const originalHp = actingPlayer.hp;
      actingPlayer.hp = Math.max(0, actingPlayer.hp - dmg);
      const resurrected = checkAndApplyResurrection(actingPlayer);
      lastActionObj = { type: 'attack', attacker: actingPlayer.name, target: actingPlayer.name, damage: originalHp - actingPlayer.hp, effect: 'self', resurrected };
      break;
    }
    default: return { ok: false, reason: 'unknown-action' };
  }
  
  const lifestealEffect = actingPlayer.statusEffects.find(e => e.type === 'lifesteal');
  if (lifestealEffect && lastActionObj.damage > 0) {
      const healAmount = Math.round(lastActionObj.damage * lifestealEffect.ratio);
      actingPlayer.hp = Math.min(actingPlayer.maxHp, actingPlayer.hp + healAmount);
      actingPlayer.statusEffects = actingPlayer.statusEffects.filter(e => e.type !== 'lifesteal');
      lastActionObj.lifestealAmount = healAmount;
  }

  gameState.lastAction = lastActionObj;
  broadcastState();
  await delay(350);
  gameState.lastAction = null;
  broadcastState();

  checkVictory();
  await nextTurn();
  checkVictory();
  broadcastState();
  return { ok: true };
}

function handleUseAbility({ playerId, ability, targetId }) {
  const player = gameState.players[playerId];
  if (!player || player.hp <= 0) return;

  const abilityConfig = ABILITIES_CONFIG[ability];
  if (!abilityConfig) return;

  // Enforce turn-only timing
  if (abilityConfig.timing === 'turn-only' && gameState.currentPlayerIndex !== playerId) {
    return;
  }
  // Prevent casting passive abilities
  if (abilityConfig.timing === 'passive') {
    return;
  }

  const abilityIndex = player.abilities.indexOf(ability);
  if (abilityIndex === -1) return;

  // Normalize targetId:
  // - keep 'boss' as string
  // - convert numeric strings to numbers (select returns strings)
  // - leave undefined/null as-is
  let normalizedTargetId = targetId;
  if (typeof targetId === 'string' && targetId !== 'boss' && targetId !== '') {
    // if numeric-looking, coerce to Number
    if (/^\d+$/.test(targetId)) normalizedTargetId = Number(targetId);
  }

  // Resolve a targetPlayer if applicable (not boss)
  let targetPlayer = null;
  if (typeof normalizedTargetId === 'number' && gameState.players[normalizedTargetId]) {
    targetPlayer = gameState.players[normalizedTargetId];
  }

  saveHistory();
  // consume the ability
  player.abilities.splice(abilityIndex, 1);

  let targetName = player.name;

  switch (ability) {
    case 'Stun':
      if (!targetPlayer) return; // must target a player
      targetPlayer.statusEffects.push({ type: 'stunned' });
      targetName = targetPlayer.name;
      break;

    case 'Disarm':
      if (!targetPlayer) return; // must target a player
      targetPlayer.statusEffects.push({ type: 'disarmed' });
      targetName = targetPlayer.name;
      break;

    case 'Increased Damage':
      player.statusEffects.push({ type: 'damageBoost', multiplier: 1.5 });
      break;

    case 'Lifesteal':
      player.statusEffects.push({ type: 'lifesteal', ratio: 0.5 });
      break;

    case 'Redirect Damage':
      player.statusEffects.push({ type: 'redirect', target: targetId });
      break;
  }

  gameState.lastAction = {
    type: 'ability',
    casterName: player.name,
    targetName,
    abilityName: ability,
    effect: ability.toLowerCase().replace(/\s/g, '')
  };
  broadcastState();
  setTimeout(() => { gameState.lastAction = null; broadcastState(); }, 600);
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
    if (res && !res.ok) socket.emit('actionRejected', res);
  });
  socket.on('useAbility', payload => handleUseAbility(payload));

  socket.on('action:pvpResult', ({ challengerIndex, opponentIndex, opponentSucceeded }) => {
    saveHistory();
    const dmg = Number(gameState.settings.pvpDamage) || DEFAULT_PVP_DAMAGE;
    let attacker, defender;
    if (opponentSucceeded) {
      [attacker, defender] = [gameState.players[opponentIndex], gameState.players[challengerIndex]];
    } else {
      [attacker, defender] = [gameState.players[challengerIndex], gameState.players[opponentIndex]];
      attacker.damageDealt += dmg;
    }

    if (defender) {
      defender.hp = Math.max(0, defender.hp - dmg);
      const resurrected = checkAndApplyResurrection(defender);
      gameState.lastAction = { type: 'attack', attacker: attacker.name, target: defender.name, damage: dmg, effect: 'slash', resurrected };
    }

    checkVictory();
    broadcastState();
    gameState.lastAction = null;
  });

  socket.on('action:correctAnswer', ({ playerIndex, value, target }) => {
    const playerId = Number(playerIndex);
    if (target === 'boss') handlePlayerAction({ playerId, action: 'attackBoss', value });
    else if (target?.type === 'player') handlePlayerAction({ playerId, action: 'attackPlayer', value, target: target.index });
  });

  socket.on('action:wrongAnswer', ({ playerIndex, value }) => {
    handlePlayerAction({ playerId: Number(playerIndex), action: 'wrongAnswer', value });
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
// Server Start
// ----------------------
const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
