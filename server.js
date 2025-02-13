const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname)));

// Game State Management
const activeGames = new Map();
const users = new Map();

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // User Management
    socket.on('userJoined', (user) => {
        const userData = {
            ...user,
            socketId: socket.id,
            wins: 0,
            losses: 0,
            draws: 0,
            gamesPlayed: 0
        };
        users.set(socket.id, userData);
        io.emit('updateUsersList', Array.from(users.values()));
    });

    // Challenge System
    socket.on('challengeUser', (opponentId) => {
        const challenger = users.get(socket.id);
        io.to(opponentId).emit('challengeReceived', challenger);
    });

    socket.on('acceptChallenge', ({ challengerId }) => {
        const roomId = `game-${socket.id}-${challengerId}`;
        [socket.id, challengerId].forEach(id => {
            const player = io.sockets.sockets.get(id);
            if(player) {
                player.join(roomId);
                player.emit('gameStart', { 
                    roomId,
                    opponent: users.get(id === socket.id ? challengerId : socket.id)
                });
            }
        });
        
        activeGames.set(roomId, {
            players: [socket.id, challengerId],
            board: Array(9).fill(null),
            currentPlayer: 'X'
        });
    });

    // Gameplay Handling
    socket.on('gameMove', ({ index, roomId }) => {
        const game = activeGames.get(roomId);
        if(game && game.players.includes(socket.id)) {
            game.board[index] = game.currentPlayer;
            game.currentPlayer = game.currentPlayer === 'X' ? 'O' : 'X';
            
            // Check game status
            const result = checkGameStatus(game.board);
            if(result) {
                handleGameEnd(roomId, result);
            }
            
            io.to(roomId).emit('gameUpdate', game);
        }
    });

    // Disconnection Handling
    socket.on('disconnect', () => {
        users.delete(socket.id);
        io.emit('updateUsersList', Array.from(users.values()));
    });

    // Helper Functions
    function checkGameStatus(board) {
        const winPatterns = [
            [0,1,2], [3,4,5], [6,7,8],
            [0,3,6], [1,4,7], [2,5,8],
            [0,4,8], [2,4,6]
        ];

        for(let pattern of winPatterns) {
            const [a,b,c] = pattern;
            if(board[a] && board[a] === board[b] && board[a] === board[c]) {
                return { winner: board[a], pattern };
            }
        }
        return board.every(cell => cell) ? 'draw' : null;
    }

    function handleGameEnd(roomId, result) {
        const game = activeGames.get(roomId);
        if(!game) return;

        game.players.forEach(playerId => {
            const player = users.get(playerId);
            if(player) {
                player.gamesPlayed++;
                if(result === 'draw') {
                    player.draws++;
                } else {
                    if(player.symbol === result.winner) {
                        player.wins++;
                    } else {
                        player.losses++;
                    }
                }
            }
        });

        io.to(roomId).emit('gameEnd', result);
        activeGames.delete(roomId);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));