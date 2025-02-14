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
    socket.on('challengeUser', ({ opponentSocketId }) => {
        const challenger = users.get(socket.id);
        io.to(opponentSocketId).emit('challengeReceived', { challenger });
    });

    socket.on('acceptChallenge', ({ challengerSocketId }) => {
        const roomId = `game-${socket.id}-${challengerSocketId}`;
        [socket.id, challengerSocketId].forEach(id => {
            const player = io.sockets.sockets.get(id);
            if(player) {
                player.join(roomId);
            }
        });
        
        const accepter = users.get(socket.id);
        io.to(challengerSocketId).emit('challengeAccepted', { accepter, roomId });
        
        activeGames.set(roomId, {
            players: [socket.id, challengerSocketId],
            board: Array(9).fill(null),
            currentPlayer: 'X'
        });

        io.to(roomId).emit('gameStart', { roomId });
    });

    socket.on('declineChallenge', ({ decliner, challengerSocketId }) => {
        io.to(challengerSocketId).emit('challengeDeclined', decliner);
    });

    // Gameplay Handling
    socket.on('gameMove', ({ move, roomId }) => {
        const game = activeGames.get(roomId);
        if(game && game.players.includes(socket.id)) {
            const { index, player } = move;
            game.board[index] = player;
            game.currentPlayer = game.currentPlayer === 'X' ? 'O' : 'X';
            
            // Broadcast the move to the opponent
            socket.to(roomId).emit('opponentMove', move);
            
            // Check game status
            const result = checkGameStatus(game.board);
            if(result) {
                handleGameEnd(roomId, result);
            }
        }
    });

    // Rematch System
    socket.on('rematchRequest', ({ requesterSocketId, opponentSocketId }) => {
        const requester = users.get(requesterSocketId);
        io.to(opponentSocketId).emit('rematchRequested', { requester });
    });

    socket.on('acceptRematch', ({ accepterSocketId, requesterSocketId }) => {
        const accepter = users.get(accepterSocketId);
        const roomId = `game-${accepterSocketId}-${requesterSocketId}`;
        
        [accepterSocketId, requesterSocketId].forEach(id => {
            const player = io.sockets.sockets.get(id);
            if(player) {
                player.join(roomId);
            }
        });

        activeGames.set(roomId, {
            players: [accepterSocketId, requesterSocketId],
            board: Array(9).fill(null),
            currentPlayer: 'X'
        });

        io.to(requesterSocketId).emit('rematchAccepted', accepter);
        io.to(roomId).emit('gameStart', { roomId });
    });

    socket.on('declineRematch', ({ declinerSocketId, requesterSocketId }) => {
        const decliner = users.get(declinerSocketId);
        io.to(requesterSocketId).emit('rematchDeclined', decliner);
    });

    // Update user stats
    socket.on('updateStats', (updatedUser) => {
        const user = users.get(socket.id);
        if (user) {
            Object.assign(user, updatedUser);
            io.emit('updateUsersList', Array.from(users.values()));
        }
    });

    // Disconnection Handling
    socket.on('disconnect', () => {
        users.delete(socket.id);
        io.emit('updateUsersList', Array.from(users.values()));

        // Handle active games
        for (const [roomId, game] of activeGames.entries()) {
            if (game.players.includes(socket.id)) {
                const opponent = game.players.find(id => id !== socket.id);
                if (opponent) {
                    io.to(opponent).emit('opponentDisconnected');
                }
                activeGames.delete(roomId);
            }
        }
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