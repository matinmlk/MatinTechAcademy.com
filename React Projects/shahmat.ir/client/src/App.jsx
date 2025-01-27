// App.jsx
import React, { useEffect, useState } from 'react';
import Chessboard from 'chessboardjsx';
import io from 'socket.io-client';
import { Chess } from 'chess.js'; // npm install chess.js
import { FaChess, FaSignInAlt, FaChessBoard } from 'react-icons/fa'; // Icons
import { AiOutlinePlusCircle } from 'react-icons/ai';

const socket = io('http://192.168.2.33:3001');

function App() {
  const [gameId, setGameId] = useState(null);
  const [fen, setFen] = useState('start');
  const [turn, setTurn] = useState('w');
  const [color, setColor] = useState(null);
  const [joinId, setJoinId] = useState('');
  const [games, setGames] = useState([]);

  useEffect(() => {
    // If we are not currently in a game, fetch the list of games
    if (!gameId) {
      fetchGames();
    }
  }, [gameId]);

  const fetchGames = async () => {
    try {
      const res = await fetch('http://192.168.2.33:3001/games');
      const data = await res.json();
      setGames(data);
    } catch (err) {
      console.error('Error fetching games:', err);
    }
  };

  useEffect(() => {
    if (!gameId) return;

    // Join the specified game
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
      return;
    });

    return () => {
      // Cleanup event listeners when gameId changes or component unmounts
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

  const startNewGame = async () => {
    try {
      const res = await fetch('http://192.168.2.33:3001/new');
      const data = await res.json();
      setGameId(data.gameId); // Set the new game ID
    } catch (err) {
      console.error('Error starting new game:', err);
    }
  };

  const joinExistingGame = () => {
    if (joinId.trim()) {
      setGameId(joinId.trim());
    }
  };

  const getFenFromPgn = (pgn) => {
    const chess = new Chess();
    chess.loadPgn(pgn);
    return chess.fen(); // The final position from the PGN
  };

  return (
    <div style={{
      fontFamily: 'Arial, sans-serif',
      padding: '20px',
      maxWidth: '600px',
      margin: '0 auto',
      textAlign: 'center'
    }}>
      {!gameId && (
        <div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '20px' }}>Welcome to Chess</h1>
          <div style={{ marginBottom: '20px' }}>
            <button 
              onClick={startNewGame}
              style={{
                backgroundColor: '#4CAF50',
                border: 'none',
                color: 'white',
                padding: '10px 15px',
                fontSize: '1rem',
                cursor: 'pointer',
                borderRadius: '5px',
                marginRight: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <AiOutlinePlusCircle /> Start New Game
            </button>
          </div>
          <div style={{ marginBottom: '30px' }}>
            <input
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              placeholder="Enter existing game ID"
              style={{
                marginRight: '10px',
                padding: '10px',
                borderRadius: '5px',
                border: '1px solid #ccc',
                width: '60%',
                maxWidth: '200px'
              }}
            />
            <button 
              onClick={joinExistingGame}
              style={{
                backgroundColor: '#008CBA',
                border: 'none',
                color: 'white',
                padding: '10px 15px',
                fontSize: '1rem',
                cursor: 'pointer',
                borderRadius: '5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <FaSignInAlt /> Join Game
            </button>
          </div>

          {games.length > 0 && (
            <>
              <h2 style={{ marginBottom: '10px', fontSize: '1.5rem' }}>Available Games</h2>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '20px',
                justifyContent: 'center'
              }}>
                {games.map((game) => (
                  <div 
                    key={game.gameId}
                    style={{
                      border: '1px solid #ccc',
                      borderRadius: '5px',
                      padding: '10px',
                      width: '200px',
                      backgroundColor: '#f9f9f9',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ marginBottom: '10px' }}>
                      <Chessboard
                        position={getFenFromPgn(game.pgn)}
                        width={180}
                        draggable={false}
                      />
                    </div>
                    <button
                      style={{
                        backgroundColor: '#555',
                        border: 'none',
                        color: 'white',
                        padding: '8px 10px',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        borderRadius: '5px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                      onClick={() => setGameId(game.gameId)}
                    >
                      <FaChessBoard /> Join Game
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {gameId && (
        <>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '20px' }}>Chess Game</h1>
          <p>You are playing as <strong>{color}</strong></p>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            marginTop: '20px' 
          }}>
            <Chessboard 
              position={fen}
              onDrop={onDrop}
              orientation={color === 'black' ? 'black' : 'white'}
              width={window.innerWidth < 500 ? 280 : 400} // responsive width
            />
          </div>
        </>
      )}
    </div>
  );
}

export default App;