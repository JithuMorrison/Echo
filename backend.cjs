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

// Store room data: Map<roomId, Set<userId>>
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  let currentUserId = null;
  let currentRoomId = null;

  // Join a room
  socket.on('join-room', (roomId, userId) => {
    currentUserId = userId;
    currentRoomId = roomId;

    socket.join(roomId);
    console.log(`User ${userId} joined room ${roomId}`);

    // Add user to room
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(userId);

    // Notify others in the room
    socket.to(roomId).emit('user-connected', userId);

    // Send the list of current users to the new user
    socket.emit('current-users', Array.from(rooms.get(roomId)));
  });

  // Leave a room
  socket.on('leave-room', (roomId, userId) => {
    handleUserLeave(roomId, userId);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    if (currentRoomId && currentUserId) {
      handleUserLeave(currentRoomId, currentUserId);
    }
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

  // Utility function to handle user leaving a room
  function handleUserLeave(roomId, userId) {
    const users = rooms.get(roomId);
    if (users && users.has(userId)) {
      users.delete(userId);
      socket.to(roomId).emit('user-disconnected', userId);
      console.log(`User ${userId} left room ${roomId}`);
      if (users.size === 0) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted`);
      }
    }
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
