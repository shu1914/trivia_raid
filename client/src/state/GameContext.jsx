import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const GameContext = createContext(null);
export function useGame(){ return useContext(GameContext); }

export function GameProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [state, setState] = useState(null);

  useEffect(() => {
    const host = window.location.hostname; // localhost on PC, LAN IP on phone
    const s = io(`http://${host}:4000`, { autoConnect: true });

    setSocket(s);

    s.on('state', (st) => setState(st));
    s.on('connect', () => console.log('Socket connected'));
    s.on('connect_error', (err) => console.warn('Socket failed to connect:', err));

    return () => s.disconnect();
  }, []);

  const api = {
    socket,
    state,
    initGame: (payload) => socket && socket.emit('initGame', payload),
    correctAnswer: (payload) => socket && socket.emit('action:correctAnswer', payload),
    wrongAnswer: (payload) => socket && socket.emit('action:wrongAnswer', payload),
    pvpResult: (payload) => socket && socket.emit('action:pvpResult', payload),
    endTurn: (payload) => socket && socket.emit('action:endTurn', payload),
    undo: () => socket && socket.emit('undo'),
  };

  return <GameContext.Provider value={api}>{children}</GameContext.Provider>;
}
