const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store room data
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join a room
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    console.log(`User ${userId} joined room ${roomId}`);
    
    // Add user to room
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(userId);
    
    // Broadcast to others in the room that a new user has joined
    socket.to(roomId).emit('user-connected', userId);
    
    // Send current users in the room to the new user
    socket.emit('current-users', Array.from(rooms.get(roomId)));
  });

  // WebRTC signaling
  socket.on('offer', (userId, offer, roomId) => {
    socket.to(roomId).emit('offer', userId, offer);
  });

  socket.on('answer', (userId, answer, roomId) => {
    socket.to(roomId).emit('answer', userId, answer);
  });

  socket.on('ice-candidate', (userId, candidate, roomId) => {
    socket.to(roomId).emit('ice-candidate', userId, candidate);
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    // Find and remove user from all rooms
    rooms.forEach((users, roomId) => {
      if (users.has(socket.id)) {
        users.delete(socket.id);
        socket.to(roomId).emit('user-disconnected', socket.id);
        if (users.size === 0) {
          rooms.delete(roomId);
        }
      }
    });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});