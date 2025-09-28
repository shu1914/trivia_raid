import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const GameContext = createContext(null);

export function useGame(){ return useContext(GameContext); }

export function GameProvider({children}){
  const [socket, setSocket] = useState(null);
  const [state, setState] = useState(null);

  useEffect(()=>{
    const s = io('http://localhost:4000');
    setSocket(s);
    s.on('state', (st)=> setState(st));
    s.on('connect', ()=> console.log('connected to server'));
    return ()=> s.disconnect();
  },[]);

  const api = {
    socket, state,
    initGame: (payload)=> socket && socket.emit('initGame', payload),
    correctAnswer: (payload)=> socket && socket.emit('action:correctAnswer', payload),
    wrongAnswer: (payload)=> socket && socket.emit('action:wrongAnswer', payload),
    pvpResult: (payload)=> socket && socket.emit('action:pvpResult', payload),
    endTurn: (payload)=> socket && socket.emit('action:endTurn', payload)
  };

  return <GameContext.Provider value={api}>{children}</GameContext.Provider>
}
