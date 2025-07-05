// backend/src/server.js - FIXED SERVICE INITIALIZATION ORDER
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const http = require('http');
require('dotenv').config();

// Import services
const webSocketService = require('./services/websocketService');
const seatLockingService = require('./services/seatLockingService');

// Init app
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// MongoDB connection
const connectDB = require('./config/db');
connectDB();

// Essential middleware
app.use(express.json({ extended: false }));
app.use(cors({
    origin: [
        process.env.FRONTEND_URL || "http://localhost:3000",
        "http://localhost:3000",
        "https://tugasakhir-mintix.vercel.app"  // 🆕 URL frontend Anda
    ],
    credentials: true
}));
app.use(session({
    secret: process.env.JWT_SECRET || 'your_jwt_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Static folders
app.use('/public', express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// ✅ CRITICAL: Make services globally available BEFORE WebSocket initialization
global.seatLockingService = seatLockingService;
global.webSocketService = webSocketService;

// ✅ CRITICAL: Initialize WebSocket service AFTER global assignment
console.log('🔗 Initializing WebSocket service...');
const io = webSocketService.initialize(server);
console.log('✅ WebSocket service initialized');

// Make io globally available
global.io = io;

// Load routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/concerts', require('./routes/concerts'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/blockchain', require('./routes/blockchain'));

// ✅ ESSENTIAL: System status untuk monitoring hybrid locking
app.get('/api/system/status', (req, res) => {
    try {
        const wsStats = webSocketService.getStats();
        const lockStats = seatLockingService.getSystemStats();

        res.json({
            success: true,
            websocket: {
                connectedUsers: wsStats.connectedUsers,
                concertRooms: wsStats.concertRooms,
                totalRoomUsers: wsStats.totalRoomUsers
            },
            seatLocking: {
                activeTempLocks: lockStats.activeTempLocks,
                activeProcessingLocks: lockStats.activeProcessingLocks,
                totalActiveLocks: lockStats.totalActiveLocks,
                activeUsers: lockStats.activeUsers
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error getting system status:', error);
        res.status(500).json({
            success: false,
            msg: 'Error getting system status'
        });
    }
});

// ✅ ESSENTIAL: Get locks untuk specific concert
app.get('/api/system/locks/:concertId', (req, res) => {
    try {
        const { concertId } = req.params;
        const locks = seatLockingService.getLocksForConcert(concertId);

        res.json({
            success: true,
            concertId,
            locks,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error getting concert locks:', error);
        res.status(500).json({
            success: false,
            msg: 'Error getting concert locks'
        });
    }
});

// ✅ ESSENTIAL: Manual cleanup untuk expired locks
app.post('/api/system/cleanup', (req, res) => {
    try {
        const cleanedCount = seatLockingService.cleanupExpiredLocks();

        res.json({
            success: true,
            message: `Cleaned up ${cleanedCount} expired locks`,
            cleanedCount,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error during cleanup:', error);
        res.status(500).json({
            success: false,
            msg: 'Error during cleanup'
        });
    }
});

// Root route dengan hybrid locking info
app.get('/', (req, res) => {
    try {
        const wsStats = webSocketService.getStats();
        const lockStats = seatLockingService.getSystemStats();

        res.json({
            msg: 'Concert NFT Tickets API with Hybrid Seat Locking',
            version: '3.0.0-hybrid',
            features: [
                'hybrid-seat-locking',
                'real-time-websocket',
                'conflict-prevention',
                'automatic-cleanup'
            ],
            status: {
                websocket: {
                    connectedUsers: wsStats.connectedUsers,
                    concertRooms: wsStats.concertRooms
                },
                seatLocking: {
                    totalActiveLocks: lockStats.totalActiveLocks,
                    tempLocks: lockStats.activeTempLocks,
                    processingLocks: lockStats.activeProcessingLocks
                }
            }
        });
    } catch (error) {
        console.error('Error in root route:', error);
        res.json({
            msg: 'Concert NFT Tickets API',
            version: '3.0.0-hybrid',
            status: 'error getting detailed status'
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {
            websocket: webSocketService ? 'active' : 'inactive',
            seatLocking: seatLockingService ? 'active' : 'inactive'
        }
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(500).json({
        success: false,
        msg: 'Server error'
    });
});

// ✅ ESSENTIAL: Graceful shutdown untuk cleanup services
const gracefulShutdown = () => {
    console.log('\n🛑 Shutting down server gracefully...');

    // Cleanup seat locking service
    if (seatLockingService && typeof seatLockingService.shutdown === 'function') {
        console.log('🔒 Shutting down seat locking service...');
        seatLockingService.shutdown();
    }

    // Cleanup websocket service
    if (webSocketService && typeof webSocketService.shutdown === 'function') {
        console.log('🔗 Shutting down websocket service...');
        webSocketService.shutdown();
    }

    // Close server
    server.close(() => {
        console.log('✅ HTTP server closed');
        process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
        console.log('❌ Forcing shutdown...');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 ===== HYBRID SEAT LOCKING SERVER =====');
    console.log(`📡 Server running on port ${PORT}`);
    console.log(`🔗 WebSocket service: ${webSocketService ? 'ACTIVE' : 'INACTIVE'}`);
    console.log(`🔒 Seat locking service: ${seatLockingService ? 'ACTIVE' : 'INACTIVE'}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🎯 Platform: ${process.env.RAILWAY_ENVIRONMENT ? 'Railway' : 'Local'}`);
    console.log('🎯 =======================================\n');
});
module.exports = { app, server, io };