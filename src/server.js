// src/server.js - ULTRA MINIMAL tapi FULL HYBRID FUNCTIONALITY
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const http = require('http'); // ✅ TAMBAH
const socketIo = require('socket.io'); // ✅ TAMBAH
require('dotenv').config();

// Init app
const app = express();
const server = http.createServer(app); // ✅ UBAH
const PORT = process.env.PORT || 5000;

// ✅ TAMBAH: Socket.IO + Global Storage (3 lines only)
const io = socketIo(server, { cors: { origin: "http://localhost:3000" } });
global.io = io;
global.seatLocks = new Map(); // RAM storage untuk temporary locks

// ✅ TAMBAH: Socket Events (MINIMAL tapi COMPLETE functionality)
io.on('connection', (socket) => {
    socket.on('join-concert', (concertId) => socket.join(`concert-${concertId}`));

    socket.on('lock-seat', (data) => {
        const seatId = `${data.concertId}-${data.sectionName}-${data.seatNumber}`;
        if (!global.seatLocks.has(seatId)) {
            global.seatLocks.set(seatId, {
                userId: data.userId,
                socketId: socket.id,
                expiresAt: Date.now() + 300000 // 5 menit
            });
            socket.emit('seat-locked', { seatId, success: true });
            socket.to(`concert-${data.concertId}`).emit('seat-taken', { seatId });
        } else {
            socket.emit('seat-locked', { seatId, success: false, reason: 'already_locked' });
        }
    });

    socket.on('disconnect', () => {
        // Auto-cleanup locks milik socket ini
        for (const [seatId, lock] of global.seatLocks.entries()) {
            if (lock.socketId === socket.id) {
                global.seatLocks.delete(seatId);
                const concertId = seatId.split('-')[0];
                io.to(`concert-${concertId}`).emit('seat-released', { seatId });
            }
        }
    });
});

// ✅ TAMBAH: Auto-cleanup expired locks (1 line)
setInterval(() => { for (const [id, lock] of global.seatLocks) if (lock.expiresAt < Date.now()) global.seatLocks.delete(id); }, 60000);

// Middleware (EXISTING - tidak diubah)
app.use(express.json({ extended: false }));
app.use(cors());
app.use(session({
    secret: process.env.JWT_SECRET || 'your_jwt_secret_key',
    resave: false,
    saveUninitialized: true
}));

// Static folder (EXISTING - tidak diubah)
app.use('/public', express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Define routes (EXISTING - tidak diubah)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/concerts', require('./routes/concerts'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/blockchain', require('./routes/blockchain'));

// Basic route (EXISTING - tidak diubah)
app.get('/', (req, res) => {
    res.json({ msg: 'Welcome to Concert NFT Tickets API' });
});

// MongoDB connection (EXISTING - tidak diubah)
const connectDB = require('./config/db');
connectDB();

// ✅ UBAH: Start server (1 line change)
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// ✅ TAMBAH: Helper functions accessible dari controllers (3 functions)
global.lockSeat = (concertId, sectionName, seatNumber, userId) => {
    const seatId = `${concertId}-${sectionName}-${seatNumber}`;
    if (global.seatLocks.has(seatId)) return false;
    global.seatLocks.set(seatId, { userId, expiresAt: Date.now() + 300000 });
    return true;
};

global.unlockSeat = (concertId, sectionName, seatNumber) => {
    const seatId = `${concertId}-${sectionName}-${seatNumber}`;
    return global.seatLocks.delete(seatId);
};

global.isLocked = (concertId, sectionName, seatNumber) => {
    const seatId = `${concertId}-${sectionName}-${seatNumber}`;
    const lock = global.seatLocks.get(seatId);
    return lock && lock.expiresAt > Date.now();
};