// App.jsx
import React, { useEffect, useState } from 'react';
import Chessboard from 'chessboardjsx';
import io from 'socket.io-client';

const socket = io();

function App({ gameId }) {
    gameId= 123;
  const [fen, setFen] = useState('start');
  const [turn, setTurn] = useState('w');
  const [color, setColor] = useState(null);

  useEffect(() => {
    socket.emit('joinGame', { gameId });

    socket.on('joined', ({ color }) => {
      setColor(color);
    });

    socket.on('update', ({ fen, turn }) => {
      setFen(fen);
      setTurn(turn);
    });

    socket.on('invalidMove', (move) => {
      alert(`Invalid move: ${move.from}-${move.to}`);
    });

    return () => {
      socket.off('joined');
      socket.off('update');
      socket.off('invalidMove');
    };
  }, [gameId]);

  const onDrop = ({ sourceSquare, targetSquare }) => {
    // Only allow moving if it’s your turn and correct color
    const myTurn = (turn === 'w' && color === 'white') || (turn === 'b' && color === 'black');
    if (!myTurn) return;

    socket.emit('move', { from: sourceSquare, to: targetSquare });
  };

  return (
    <div>
      <h1>Chess Game</h1>
      <p>You are playing as {color}</p>
      <Chessboard position={fen} onDrop={onDrop} orientation={color === 'black' ? 'black' : 'white'} />
    </div>
  );
}

export default App;