// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const Chess = require('chess.js').Chess;
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://192.168.2.33:5000",
    methods: ["GET", "POST"]
  }
});

app.use(cors());

const games = {}; // { gameId: { chess: ChessInstance, players: [], ... } }

app.use(express.static('public')); // where your client build is served

app.get('/new', (req, res) => {
  const gameId = uuidv4();
  // Initialize a new chess game
  games[gameId] = {
    chess: new Chess(),
    players: []
  };
  res.json({ gameId });
});

app.get('/games', (req, res) => {
  const allGames = Object.entries(games).map(([gameId, gameObj]) => ({
    gameId,
    pgn: gameObj.chess.pgn()
  }));
  
  res.json(allGames);
});

app.get('/game/:gameId', (req, res) => {
  const { gameId } = req.params;
  console.log('/game/:gameId');
  if (!games[gameId]) {
    return res.status(404).send('Game not found');
  }
  // Serve the client application which handles the Socket.IO connection.
  res.sendFile(__dirname + '/public/index.html');
});

io.on('connection', (socket) => {
  let currentGameId = null;

  socket.on('joinGame', ({ gameId }) => {
    console.log('/joinGame/' + gameId);
    
    if (!games[gameId]) {
      socket.emit('error', 'Game does not exist');
      return;
    }

    if (games[gameId].players.length < 2) {
      games[gameId].players.push(socket.id);
      socket.emit('joined', { color: games[gameId].players.length === 1 ? 'white' : 'black' });
    } else {
      socket.emit('joined', { color: 'spectator' });
    }

    currentGameId = gameId;
    socket.join(gameId);

    // Send the current board state
    socket.emit('update', {
      fen: games[gameId].chess.fen(),
      turn: games[gameId].chess.turn()
    });
  });

  socket.on('move', (move) => {
    // move: { from: 'e2', to: 'e4' }
    if (!currentGameId || !games[currentGameId]) return;
    const game = games[currentGameId].chess;
    try {
      const result = game.move(move);
      
        io.to(currentGameId).emit('update', {
          fen: game.fen(),
          turn: game.turn(),
          lastMove: result
        });

    } catch (error) {
        socket.emit('invalidMove', move);
      
    }
  });

  socket.on('disconnect', () => {
    // Handle player disconnects if needed
  });
});

server.listen(3001, () => {
  console.log('Server listening on http://192.168.2.33:3001');
});