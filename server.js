const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

// Serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const users = new Map();

io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('userJoined', (user) => {
        users.set(socket.id, user);
        io.emit('updateUsersList', Array.from(users.values()));
    });

    socket.on('userUpdated', (user) => {
        users.set(socket.id, user);
        io.emit('updateUsersList', Array.from(users.values()));
    });

    socket.on('userLeft', (user) => {
        users.delete(socket.id);
        io.emit('updateUsersList', Array.from(users.values()));
    });

    
    // Challenge system
    // Update challenge system handlers
socket.on('challengeUser', ({ opponentSocketId }) => {
    const challenger = users.get(socket.id);
    if (users.has(opponentSocketId)) {
        io.to(opponentSocketId).emit('challengeReceived', {
            challenger: { ...challenger, socketId: socket.id }
        });
    }
});

socket.on('acceptChallenge', ({ challengerSocketId }) => {
    const roomId = `${socket.id}-${challengerSocketId}`;
    
    // Join both players to the same room
    socket.join(roomId);
    io.to(challengerSocketId).emit('joinRoom', roomId);
    
    // Notify both players
    io.to(challengerSocketId).emit('challengeAccepted', {
        accepter: users.get(socket.id),
        roomId
    });
    socket.emit('challengeAccepted', {
        accepter: users.get(socket.id),
        roomId
    });
});

// Update game move handler
socket.on('gameMove', ({ move, roomId }) => {
    socket.to(roomId).emit('opponentMove', move);
});


    socket.on('declineChallenge', ({ decliner, challenger }) => {
        io.to(challenger.id).emit('challengeDeclined', decliner);
    });

    socket.on('gameMove', ({ player, move }) => {
        socket.broadcast.emit('opponentMove', move);
    });

    socket.on('rematchRequest', ({ requester, opponent }) => {
        io.to(opponent.id).emit('rematchRequested', requester);
    });

    socket.on('acceptRematch', ({ accepter, requester }) => {
        io.to(requester.id).emit('rematchAccepted', accepter);
    });

    socket.on('declineRematch', ({ decliner, requester }) => {
        io.to(requester.id).emit('rematchDeclined', decliner);
    });

    socket.on('updateStats', (user) => {
        users.set(socket.id, user);
    });

    socket.on('disconnect', () => {
        users.delete(socket.id);
        io.emit('updateUsersList', Array.from(users.values()));
        console.log('Client disconnected');
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Server running on port ${port}`));