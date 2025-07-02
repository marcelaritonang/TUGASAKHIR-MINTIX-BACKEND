// backend/src/services/websocketService.js - IMPROVED PRODUCTION VERSION
const socketIo = require('socket.io');

class WebSocketService {
    constructor() {
        this.io = null;
        this.connectedUsers = new Map();
        this.concertRooms = new Map(); // Track users per concert

        // **NEW: Connection health monitoring**
        this.connectionStats = {
            totalConnections: 0,
            currentConnections: 0,
            totalDisconnections: 0,
            totalErrors: 0,
            peakConnections: 0
        };

        // **NEW: Error tracking**
        this.recentErrors = [];
        this.maxErrorHistory = 100;

        // **NEW: Rate limiting per socket**
        this.rateLimits = new Map(); // socketId -> { requests: [], lastReset: timestamp }
        this.maxRequestsPerMinute = parseInt(process.env.WS_RATE_LIMIT) || 60;

        console.log('🔗 Enhanced WebSocket service initialized');
    }

    initialize(server) {
        this.io = socketIo(server, {
            cors: {
                origin: process.env.WEBSOCKET_CORS_ORIGIN || process.env.FRONTEND_URL || "http://localhost:3000",
                methods: ["GET", "POST"],
                credentials: true
            },
            pingTimeout: 60000,
            pingInterval: 25000,
            // **NEW: Enhanced configuration**
            maxHttpBufferSize: 1e6, // 1MB
            allowEIO3: true,
            transports: ['websocket', 'polling']
        });

        this.setupConnectionHandlers();
        this.bindSeatLockingEvents();
        this.startHealthMonitoring();

        // Make io globally available
        global.io = this.io;

        console.log('✅ Enhanced WebSocket service ready with health monitoring');
        return this.io;
    }

    /**
     * **IMPROVED: Enhanced connection handling with error boundaries**
     */
    setupConnectionHandlers() {
        this.io.on('connection', (socket) => {
            this.handleNewConnection(socket);

            // **IMPROVED: Wrap all handlers in error boundaries**
            this.setupSocketHandlers(socket);
        });

        // **NEW: Global error handling**
        this.io.engine.on('connection_error', (err) => {
            this.logError('Connection Error', err);
        });
    }

    /**
     * **NEW: Handle new connection with enhanced tracking**
     */
    handleNewConnection(socket) {
        this.connectionStats.totalConnections++;
        this.connectionStats.currentConnections++;

        if (this.connectionStats.currentConnections > this.connectionStats.peakConnections) {
            this.connectionStats.peakConnections = this.connectionStats.currentConnections;
        }

        // **NEW: Initialize rate limiting**
        this.rateLimits.set(socket.id, {
            requests: [],
            lastReset: Date.now()
        });

        console.log(`🔌 User connected: ${socket.id} (Total: ${this.connectionStats.currentConnections})`);
    }

    /**
     * **NEW: Setup socket handlers with error boundaries**
     */
    setupSocketHandlers(socket) {
        // Authentication handler
        socket.on('authenticate', (data) => {
            this.handleWithErrorBoundary(socket, 'authenticate', data, this.handleAuthenticate.bind(this));
        });

        // Seat selection handler
        socket.on('selectSeat', (data) => {
            this.handleWithErrorBoundary(socket, 'selectSeat', data, this.handleSeatSelection.bind(this));
        });

        // Seat release handler
        socket.on('releaseSeat', (data) => {
            this.handleWithErrorBoundary(socket, 'releaseSeat', data, this.handleSeatRelease.bind(this));
        });

        // Get seat status handler
        socket.on('getSeatStatus', (data) => {
            this.handleWithErrorBoundary(socket, 'getSeatStatus', data, this.handleGetSeatStatus.bind(this));
        });

        // Get concert locks handler
        socket.on('getConcertLocks', (data) => {
            this.handleWithErrorBoundary(socket, 'getConcertLocks', data, this.handleGetConcertLocks.bind(this));
        });

        // **NEW: Connection health check**
        socket.on('ping', (data) => {
            this.handleWithErrorBoundary(socket, 'ping', data, this.handlePing.bind(this));
        });

        // **NEW: Request user's current locks**
        socket.on('getMyLocks', (data) => {
            this.handleWithErrorBoundary(socket, 'getMyLocks', data, this.handleGetMyLocks.bind(this));
        });

        // Disconnect handler
        socket.on('disconnect', (reason) => {
            this.handleUserDisconnect(socket, reason);
        });

        // **NEW: Error handler**
        socket.on('error', (error) => {
            this.logError(`Socket Error [${socket.id}]`, error);
        });
    }

    /**
     * **NEW: Error boundary wrapper for all socket handlers**
     */
    handleWithErrorBoundary(socket, eventName, data, handler) {
        try {
            // **NEW: Rate limiting check**
            if (!this.checkRateLimit(socket.id)) {
                socket.emit('error', {
                    message: 'Rate limit exceeded. Please slow down.',
                    code: 'RATE_LIMIT_EXCEEDED',
                    retryAfter: 60000
                });
                return;
            }

            // **NEW: Input validation**
            if (!this.validateInput(eventName, data)) {
                socket.emit('error', {
                    message: 'Invalid input data',
                    code: 'INVALID_INPUT',
                    event: eventName
                });
                return;
            }

            handler(socket, data);
        } catch (error) {
            this.logError(`Handler Error [${eventName}]`, error, { socketId: socket.id, data });
            socket.emit('error', {
                message: 'Internal server error',
                code: 'INTERNAL_ERROR',
                event: eventName
            });
        }
    }

    /**
     * **NEW: Rate limiting implementation**
     */
    checkRateLimit(socketId) {
        const now = Date.now();
        const limit = this.rateLimits.get(socketId);

        if (!limit) return true;

        // Reset counter every minute
        if (now - limit.lastReset > 60000) {
            limit.requests = [];
            limit.lastReset = now;
        }

        // Remove requests older than 1 minute
        limit.requests = limit.requests.filter(timestamp => now - timestamp < 60000);

        // Check if under limit
        if (limit.requests.length >= this.maxRequestsPerMinute) {
            return false;
        }

        // Add current request
        limit.requests.push(now);
        return true;
    }

    /**
     * **NEW: Input validation**
     */
    validateInput(eventName, data) {
        if (!data || typeof data !== 'object') {
            return false;
        }

        switch (eventName) {
            case 'authenticate':
                return data.walletAddress && typeof data.walletAddress === 'string';

            case 'selectSeat':
            case 'releaseSeat':
            case 'getSeatStatus':
                return data.concertId && data.sectionName && data.seatNumber;

            case 'getConcertLocks':
            case 'getMyLocks':
                return data.concertId;

            default:
                return true;
        }
    }

    /**
     * **IMPROVED: Authentication handler**
     */
    handleAuthenticate(socket, data) {
        const { walletAddress, concertId } = data;

        socket.userId = walletAddress;
        socket.concertId = concertId;

        // Join concert room if specified
        if (concertId) {
            const roomName = `concert_${concertId}`;
            socket.join(roomName);

            // Track users in concert room
            if (!this.concertRooms.has(concertId)) {
                this.concertRooms.set(concertId, new Set());
            }
            this.concertRooms.get(concertId).add(socket.id);

            console.log(`👤 User ${walletAddress} joined concert room: ${concertId}`);
        }

        // Store user connection with enhanced data
        this.connectedUsers.set(socket.id, {
            socketId: socket.id,
            walletAddress,
            concertId,
            connectedAt: Date.now(),
            lastActivity: Date.now(),
            requestCount: 0
        });

        socket.emit('authenticated', {
            success: true,
            userId: walletAddress,
            concertId: concertId,
            connectedUsers: this.getConnectedUsersCount(concertId),
            serverTime: Date.now()
        });

        console.log(`✅ User authenticated: ${walletAddress} in concert ${concertId}`);
    }

    /**
     * **IMPROVED: Seat selection handler with better error handling**
     */
    async handleSeatSelection(socket, data) {
        const { concertId, sectionName, seatNumber } = data;
        const userId = socket.userId;

        if (!userId) {
            socket.emit('error', { message: 'Not authenticated', code: 'NOT_AUTHENTICATED' });
            return;
        }

        console.log(`🎫 Seat selection request: ${concertId}-${sectionName}-${seatNumber} by ${userId}`);

        // **IMPROVED: Get seat locking service safely**
        const seatLockingService = this.getSeatLockingService();
        if (!seatLockingService) {
            socket.emit('error', { message: 'Seat locking service unavailable', code: 'SERVICE_UNAVAILABLE' });
            return;
        }

        try {
            // Attempt to lock seat
            const lockResult = seatLockingService.lockSeatTemporarily(
                concertId, sectionName, seatNumber, userId
            );

            if (lockResult.success) {
                // Update user activity
                this.updateUserActivity(socket.id);

                // Notify user of successful lock
                socket.emit('seatLocked', {
                    success: true,
                    seatKey: `${concertId}-${sectionName}-${seatNumber}`,
                    concertId,
                    sectionName,
                    seatNumber,
                    expiresAt: lockResult.expiresAt,
                    timeRemaining: lockResult.timeRemaining,
                    lockType: lockResult.type,
                    lockId: lockResult.lockId,
                    renewCount: lockResult.renewCount || 0
                });

                // Broadcast to other users in the concert
                socket.to(`concert_${concertId}`).emit('seatStatusUpdate', {
                    action: 'locked',
                    concertId,
                    sectionName,
                    seatNumber,
                    lockedBy: 'other_user',
                    temporary: true,
                    expiresAt: lockResult.expiresAt,
                    lockId: lockResult.lockId
                });

                console.log(`✅ Seat ${sectionName}-${seatNumber} locked for ${userId} [${lockResult.lockId}]`);
            } else {
                // Seat unavailable
                socket.emit('seatUnavailable', {
                    success: false,
                    reason: lockResult.reason,
                    concertId,
                    sectionName,
                    seatNumber,
                    message: this.getSeatUnavailableMessage(lockResult.reason),
                    expiresAt: lockResult.expiresAt,
                    timeRemaining: lockResult.timeRemaining,
                    maxAllowed: lockResult.maxAllowed
                });

                console.log(`❌ Seat ${sectionName}-${seatNumber} unavailable for ${userId}: ${lockResult.reason}`);
            }
        } catch (error) {
            this.logError('Seat Selection Error', error, { userId, seatKey: `${concertId}-${sectionName}-${seatNumber}` });
            socket.emit('error', {
                message: 'Failed to select seat',
                code: 'SEAT_SELECTION_ERROR'
            });
        }
    }

    /**
     * **IMPROVED: Seat release handler**
     */
    handleSeatRelease(socket, data) {
        const { concertId, sectionName, seatNumber } = data;
        const userId = socket.userId;

        if (!userId) return;

        console.log(`🔓 Seat release request: ${concertId}-${sectionName}-${seatNumber} by ${userId}`);

        const seatLockingService = this.getSeatLockingService();
        if (!seatLockingService) {
            socket.emit('error', { message: 'Seat locking service unavailable', code: 'SERVICE_UNAVAILABLE' });
            return;
        }

        try {
            const unlockResult = seatLockingService.unlockSeat(
                concertId, sectionName, seatNumber, userId
            );

            if (unlockResult.success) {
                this.updateUserActivity(socket.id);

                socket.emit('seatReleased', {
                    success: true,
                    concertId,
                    sectionName,
                    seatNumber,
                    lockType: unlockResult.type
                });

                // Broadcast availability to other users
                socket.to(`concert_${concertId}`).emit('seatStatusUpdate', {
                    action: 'available',
                    concertId,
                    sectionName,
                    seatNumber,
                    reason: 'user_released'
                });

                console.log(`✅ Seat ${sectionName}-${seatNumber} released by ${userId}`);
            } else {
                socket.emit('seatReleaseError', {
                    success: false,
                    reason: unlockResult.reason,
                    message: 'Failed to release seat'
                });
            }
        } catch (error) {
            this.logError('Seat Release Error', error, { userId, seatKey: `${concertId}-${sectionName}-${seatNumber}` });
        }
    }

    /**
     * **IMPROVED: Get seat status handler**
     */
    handleGetSeatStatus(socket, data) {
        const { concertId, sectionName, seatNumber } = data;

        const seatLockingService = this.getSeatLockingService();
        if (!seatLockingService) {
            socket.emit('error', { message: 'Seat locking service unavailable', code: 'SERVICE_UNAVAILABLE' });
            return;
        }

        try {
            const status = seatLockingService.checkSeatLockStatus(
                concertId, sectionName, seatNumber
            );

            socket.emit('seatStatus', {
                concertId,
                sectionName,
                seatNumber,
                ...status,
                timestamp: Date.now()
            });
        } catch (error) {
            this.logError('Get Seat Status Error', error);
            socket.emit('error', { message: 'Failed to get seat status', code: 'STATUS_ERROR' });
        }
    }

    /**
     * **IMPROVED: Get concert locks handler**
     */
    handleGetConcertLocks(socket, data) {
        const { concertId } = data;

        const seatLockingService = this.getSeatLockingService();
        if (!seatLockingService) {
            socket.emit('error', { message: 'Seat locking service unavailable', code: 'SERVICE_UNAVAILABLE' });
            return;
        }

        try {
            const locks = seatLockingService.getLocksForConcert(concertId);

            socket.emit('concertLocks', {
                concertId,
                ...locks,
                timestamp: Date.now()
            });
        } catch (error) {
            this.logError('Get Concert Locks Error', error);
            socket.emit('error', { message: 'Failed to get concert locks', code: 'LOCKS_ERROR' });
        }
    }

    /**
     * **NEW: Get user's current locks**
     */
    handleGetMyLocks(socket, data) {
        const userId = socket.userId;
        if (!userId) {
            socket.emit('error', { message: 'Not authenticated', code: 'NOT_AUTHENTICATED' });
            return;
        }

        const seatLockingService = this.getSeatLockingService();
        if (!seatLockingService) {
            socket.emit('error', { message: 'Seat locking service unavailable', code: 'SERVICE_UNAVAILABLE' });
            return;
        }

        try {
            const userLocks = seatLockingService.getUserActiveLocks(userId);
            const lockDetails = [];

            for (const seatKey of userLocks) {
                const [concertId, sectionName, seatNumber] = seatKey.split('-');
                const status = seatLockingService.checkSeatLockStatus(concertId, sectionName, seatNumber);

                if (status.locked && status.lockedBy === userId) {
                    lockDetails.push({
                        seatKey,
                        concertId,
                        sectionName,
                        seatNumber,
                        ...status
                    });
                }
            }

            socket.emit('myLocks', {
                success: true,
                locks: lockDetails,
                count: lockDetails.length,
                timestamp: Date.now()
            });
        } catch (error) {
            this.logError('Get My Locks Error', error);
            socket.emit('error', { message: 'Failed to get your locks', code: 'MY_LOCKS_ERROR' });
        }
    }

    /**
     * **NEW: Ping handler for connection health**
     */
    handlePing(socket, data) {
        this.updateUserActivity(socket.id);

        socket.emit('pong', {
            timestamp: Date.now(),
            serverTime: Date.now(),
            latency: data.timestamp ? Date.now() - data.timestamp : null
        });
    }

    /**
     * **IMPROVED: Bind seat locking events with error handling**
     */
    bindSeatLockingEvents() {
        const seatLockingService = this.getSeatLockingService();
        if (!seatLockingService) {
            console.warn('⚠️ Cannot bind seat locking events - service not available');
            return;
        }

        try {
            // Listen to seat locking events and broadcast to relevant users
            seatLockingService.on('seatLocked', (data) => {
                this.broadcastToConcert(data.concertId, 'seatStatusUpdate', {
                    action: 'locked',
                    concertId: data.concertId,
                    sectionName: data.sectionName,
                    seatNumber: data.seatNumber,
                    lockType: data.lockType,
                    expiresAt: data.expiresAt,
                    lockedBy: 'other_user',
                    lockId: data.lockId
                });
            });

            seatLockingService.on('seatUnlocked', (data) => {
                this.broadcastToConcert(data.concertId, 'seatStatusUpdate', {
                    action: 'available',
                    concertId: data.concertId,
                    sectionName: data.sectionName,
                    seatNumber: data.seatNumber,
                    lockType: data.lockType,
                    lockId: data.lockId,
                    reason: 'unlocked'
                });
            });

            seatLockingService.on('seatMinted', (data) => {
                this.broadcastToConcert(data.concertId, 'seatStatusUpdate', {
                    action: 'minted',
                    concertId: data.concertId,
                    sectionName: data.sectionName,
                    seatNumber: data.seatNumber,
                    success: data.success,
                    permanent: true,
                    processingId: data.processingId,
                    lockId: data.lockId
                });
            });

            seatLockingService.on('seatProcessing', (data) => {
                this.broadcastToConcert(data.concertId, 'seatStatusUpdate', {
                    action: 'processing',
                    concertId: data.concertId,
                    sectionName: data.sectionName,
                    seatNumber: data.seatNumber,
                    operationType: data.operationType,
                    expiresAt: data.expiresAt,
                    processingId: data.processingId
                });
            });

            seatLockingService.on('lockExpired', (data) => {
                this.broadcastToConcert(data.concertId, 'seatStatusUpdate', {
                    action: 'available',
                    concertId: data.concertId,
                    sectionName: data.sectionName,
                    seatNumber: data.seatNumber,
                    reason: 'lock_expired',
                    lockType: data.lockType,
                    lockId: data.lockId || data.processingId
                });

                // Send warning to the user whose lock expired
                this.notifyUserLockExpired(data.userId, data);
            });

            seatLockingService.on('lockExpiring', (data) => {
                // Warning 30 seconds before expiration
                this.notifyUserLockExpiring(data.userId, data);
            });

            console.log('✅ Seat locking events bound successfully');
        } catch (error) {
            this.logError('Error binding seat locking events', error);
        }
    }

    /**
     * **IMPROVED: Enhanced user disconnect handling**
     */
    handleUserDisconnect(socket, reason) {
        console.log(`🔌 User disconnected: ${socket.id} (Reason: ${reason})`);

        this.connectionStats.currentConnections--;
        this.connectionStats.totalDisconnections++;

        const userInfo = this.connectedUsers.get(socket.id);
        if (userInfo) {
            // **IMPROVED: Use proper service method instead of direct access**
            this.releaseUserLocks(userInfo.walletAddress);

            // Remove from concert room tracking
            if (userInfo.concertId && this.concertRooms.has(userInfo.concertId)) {
                this.concertRooms.get(userInfo.concertId).delete(socket.id);

                // Clean up empty concert rooms
                if (this.concertRooms.get(userInfo.concertId).size === 0) {
                    this.concertRooms.delete(userInfo.concertId);
                }
            }

            this.connectedUsers.delete(socket.id);
        }

        // **NEW: Clean up rate limiting**
        this.rateLimits.delete(socket.id);

        console.log(`📊 Current connections: ${this.connectionStats.currentConnections}`);
    }

    /**
     * **IMPROVED: Release user locks using proper service methods**
     */
    releaseUserLocks(walletAddress) {
        console.log(`🔓 Releasing all locks for disconnected user: ${walletAddress}`);

        const seatLockingService = this.getSeatLockingService();
        if (!seatLockingService) {
            console.warn('⚠️ Cannot release user locks - seat locking service not available');
            return;
        }

        try {
            // **FIXED: Use proper service method instead of direct map access**
            const userLocks = seatLockingService.getUserActiveLocks(walletAddress);

            for (const seatKey of userLocks) {
                const [concertId, sectionName, seatNumber] = seatKey.split('-');

                const unlockResult = seatLockingService.unlockSeat(
                    concertId, sectionName, seatNumber, walletAddress, true // force = true
                );

                if (unlockResult.success) {
                    // Broadcast that seat is available
                    this.broadcastToConcert(concertId, 'seatStatusUpdate', {
                        action: 'available',
                        concertId,
                        sectionName,
                        seatNumber,
                        reason: 'user_disconnected'
                    });
                }
            }

            console.log(`✅ Released ${userLocks.size} locks for disconnected user: ${walletAddress}`);
        } catch (error) {
            this.logError('Error releasing user locks', error, { walletAddress });
        }
    }

    /**
     * **NEW: Health monitoring**
     */
    startHealthMonitoring() {
        // Monitor connection health every 5 minutes
        setInterval(() => {
            this.performHealthCheck();
        }, 5 * 60 * 1000);

        // Clean up old errors every hour
        setInterval(() => {
            this.cleanupOldErrors();
        }, 60 * 60 * 1000);

        console.log('🏥 Health monitoring started');
    }

    performHealthCheck() {
        const stats = this.getStats();

        console.log(`🏥 Health Check: ${stats.connectedUsers} users, ${stats.concertRooms} rooms, ${stats.recentErrors} recent errors`);

        // Alert if too many errors
        if (this.recentErrors.length > 50) {
            console.warn(`⚠️ High error rate detected: ${this.recentErrors.length} errors in recent history`);
        }

        // Alert if memory usage seems high
        if (this.connectedUsers.size > 1000) {
            console.warn(`⚠️ High connection count: ${this.connectedUsers.size} users`);
        }
    }

    cleanupOldErrors() {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        this.recentErrors = this.recentErrors.filter(error => error.timestamp > oneHourAgo);
    }

    /**
     * **NEW: Enhanced error logging**
     */
    logError(message, error, context = {}) {
        const errorInfo = {
            message,
            error: error.message || error,
            stack: error.stack,
            context,
            timestamp: Date.now()
        };

        this.recentErrors.push(errorInfo);

        // Keep only recent errors
        if (this.recentErrors.length > this.maxErrorHistory) {
            this.recentErrors = this.recentErrors.slice(-this.maxErrorHistory);
        }

        this.connectionStats.totalErrors++;

        console.error(`🚨 WebSocket Error: ${message}`, error, context);
    }

    /**
     * **NEW: Safe service getter**
     */
    getSeatLockingService() {
        return global.seatLockingService || null;
    }

    /**
     * **NEW: Update user activity tracking**
     */
    updateUserActivity(socketId) {
        const user = this.connectedUsers.get(socketId);
        if (user) {
            user.lastActivity = Date.now();
            user.requestCount = (user.requestCount || 0) + 1;
        }
    }

    // **EXISTING METHODS** (improved where noted)

    broadcastToConcert(concertId, event, data) {
        if (this.io) {
            this.io.to(`concert_${concertId}`).emit(event, data);
        }
    }

    notifyUserLockExpired(userId, lockData) {
        // Find user's socket and notify
        for (const [socketId, userInfo] of this.connectedUsers.entries()) {
            if (userInfo.walletAddress === userId) {
                const socket = this.io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit('lockExpired', {
                        concertId: lockData.concertId,
                        sectionName: lockData.sectionName,
                        seatNumber: lockData.seatNumber,
                        lockType: lockData.lockType,
                        message: 'Your seat selection has expired',
                        lockId: lockData.lockId || lockData.processingId
                    });
                }
                break;
            }
        }
    }

    notifyUserLockExpiring(userId, lockData) {
        // Find user's socket and send warning
        for (const [socketId, userInfo] of this.connectedUsers.entries()) {
            if (userInfo.walletAddress === userId) {
                const socket = this.io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit('lockExpiring', {
                        concertId: lockData.concertId,
                        sectionName: lockData.sectionName,
                        seatNumber: lockData.seatNumber,
                        timeRemaining: 30000, // 30 seconds
                        message: 'Your seat selection expires in 30 seconds',
                        lockId: lockData.lockId
                    });
                }
                break;
            }
        }
    }

    getSeatUnavailableMessage(reason) {
        switch (reason) {
            case 'seat_locked':
                return 'This seat is currently selected by another user';
            case 'processing_conflict':
            case 'seat_processing':
                return 'This seat is being processed by another user';
            case 'already_minted':
                return 'This seat has already been purchased';
            case 'max_locks_exceeded':
                return 'You have reached the maximum number of seat selections';
            default:
                return 'This seat is not available';
        }
    }

    getConnectedUsersCount(concertId) {
        if (!concertId || !this.concertRooms.has(concertId)) {
            return 0;
        }
        return this.concertRooms.get(concertId).size;
    }

    getConnectedUsers() {
        return Array.from(this.connectedUsers.values());
    }

    // Broadcast system message to all users in a concert
    broadcastSystemMessage(concertId, message, type = 'info') {
        this.broadcastToConcert(concertId, 'systemMessage', {
            type,
            message,
            timestamp: Date.now()
        });
    }

    // **IMPROVED: Enhanced service statistics**
    getStats() {
        const seatLockingService = this.getSeatLockingService();

        return {
            // Connection stats
            ...this.connectionStats,

            // Current state
            connectedUsers: this.connectedUsers.size,
            concertRooms: this.concertRooms.size,
            totalRoomUsers: Array.from(this.concertRooms.values())
                .reduce((total, room) => total + room.size, 0),

            // Health metrics
            recentErrors: this.recentErrors.length,
            rateLimitEntries: this.rateLimits.size,

            // Seat locking integration
            seatLockingStats: seatLockingService ? seatLockingService.getSystemStats() : null,

            // Performance metrics
            averageRequestsPerUser: this.connectedUsers.size > 0 ?
                Array.from(this.connectedUsers.values())
                    .reduce((sum, user) => sum + (user.requestCount || 0), 0) / this.connectedUsers.size : 0,

            timestamp: Date.now()
        };
    }

    /**
     * **NEW: Broadcast maintenance mode**
     */
    broadcastMaintenanceMode(enabled, message = null) {
        const data = {
            maintenanceMode: enabled,
            message: message || (enabled ? 'System maintenance in progress' : 'System is back online'),
            timestamp: Date.now()
        };

        this.io.emit('maintenanceMode', data);
        console.log(`🔧 Maintenance mode ${enabled ? 'ENABLED' : 'DISABLED'}: ${data.message}`);
    }

    /**
     * **NEW: Force disconnect user**
     */
    forceDisconnectUser(walletAddress, reason = 'Administrative action') {
        for (const [socketId, userInfo] of this.connectedUsers.entries()) {
            if (userInfo.walletAddress === walletAddress) {
                const socket = this.io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit('forceDisconnect', {
                        reason,
                        timestamp: Date.now()
                    });
                    socket.disconnect(true);
                }
                break;
            }
        }
    }

    /**
     * **NEW: Get user connection info**
     */
    getUserConnectionInfo(walletAddress) {
        for (const [socketId, userInfo] of this.connectedUsers.entries()) {
            if (userInfo.walletAddress === walletAddress) {
                return {
                    ...userInfo,
                    connectionDuration: Date.now() - userInfo.connectedAt,
                    isActive: Date.now() - userInfo.lastActivity < 60000 // Active within last minute
                };
            }
        }
        return null;
    }

    /**
     * **NEW: Clean up inactive connections**
     */
    cleanupInactiveConnections() {
        const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
        const now = Date.now();
        let cleanedCount = 0;

        for (const [socketId, userInfo] of this.connectedUsers.entries()) {
            if (now - userInfo.lastActivity > inactiveThreshold) {
                const socket = this.io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit('inactivityDisconnect', {
                        message: 'Disconnected due to inactivity',
                        inactiveTime: now - userInfo.lastActivity,
                        timestamp: now
                    });
                    socket.disconnect(true);
                    cleanedCount++;
                }
            }
        }

        if (cleanedCount > 0) {
            console.log(`🧹 Cleaned up ${cleanedCount} inactive connections`);
        }

        return cleanedCount;
    }

    /**
     * **NEW: Emergency shutdown**
     */
    emergencyShutdown(reason = 'Emergency maintenance') {
        console.log(`🚨 EMERGENCY SHUTDOWN: ${reason}`);

        // Notify all connected users
        this.io.emit('emergencyShutdown', {
            reason,
            message: 'Service is temporarily unavailable due to emergency maintenance',
            timestamp: Date.now()
        });

        // Give users 5 seconds to receive the message
        setTimeout(() => {
            // Force disconnect all users
            this.io.disconnectSockets(true);

            // Clear all tracking maps
            this.connectedUsers.clear();
            this.concertRooms.clear();
            this.rateLimits.clear();

            console.log('🚨 Emergency shutdown completed');
        }, 5000);
    }

    /**
     * **NEW: Get concert statistics**
     */
    getConcertStats(concertId) {
        const roomUsers = this.concertRooms.get(concertId);
        if (!roomUsers) {
            return {
                concertId,
                connectedUsers: 0,
                users: [],
                hasActiveUsers: false
            };
        }

        const users = [];
        for (const socketId of roomUsers) {
            const userInfo = this.connectedUsers.get(socketId);
            if (userInfo) {
                users.push({
                    walletAddress: userInfo.walletAddress,
                    connectedAt: userInfo.connectedAt,
                    lastActivity: userInfo.lastActivity,
                    requestCount: userInfo.requestCount || 0,
                    connectionDuration: Date.now() - userInfo.connectedAt
                });
            }
        }

        return {
            concertId,
            connectedUsers: roomUsers.size,
            users,
            hasActiveUsers: users.some(user => Date.now() - user.lastActivity < 60000)
        };
    }

    /**
     * **NEW: Validate system health**
     */
    validateSystemHealth() {
        const issues = [];
        const stats = this.getStats();

        // Check error rate
        if (stats.recentErrors > 100) {
            issues.push({
                type: 'high_error_rate',
                message: `High error rate: ${stats.recentErrors} recent errors`,
                severity: 'warning'
            });
        }

        // Check connection count
        if (stats.connectedUsers > 5000) {
            issues.push({
                type: 'high_connection_count',
                message: `Very high connection count: ${stats.connectedUsers}`,
                severity: 'warning'
            });
        }

        // Check seat locking service
        const seatLockingService = this.getSeatLockingService();
        if (!seatLockingService) {
            issues.push({
                type: 'service_unavailable',
                message: 'Seat locking service is not available',
                severity: 'critical'
            });
        }

        // Check memory usage patterns
        if (this.rateLimits.size > stats.connectedUsers * 1.5) {
            issues.push({
                type: 'memory_leak_suspected',
                message: 'Rate limit entries exceed expected count',
                severity: 'warning'
            });
        }

        return {
            healthy: issues.length === 0,
            issues,
            lastCheck: Date.now(),
            stats
        };
    }

    /**
     * **NEW: Enhanced cleanup for shutdown**
     */
    shutdown() {
        console.log('🔗 Starting WebSocket service shutdown...');

        // Stop health monitoring
        // (intervals would be cleared automatically, but good practice)

        // Notify all users of shutdown
        this.io.emit('serviceShutdown', {
            message: 'WebSocket service is shutting down',
            timestamp: Date.now()
        });

        // Clean up all tracking
        this.connectedUsers.clear();
        this.concertRooms.clear();
        this.rateLimits.clear();
        this.recentErrors = [];

        // Close all connections
        this.io.disconnectSockets(true);

        console.log('🔗 WebSocket service shutdown complete');
    }
}

// Create singleton instance
const webSocketService = new WebSocketService();

// Enhanced graceful shutdown
const gracefulShutdown = (signal) => {
    console.log(`\n🛑 Received ${signal}, shutting down WebSocket service...`);
    webSocketService.shutdown();
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// **NEW: Handle uncaught errors**
process.on('uncaughtException', (error) => {
    console.error('🚨 Uncaught Exception in WebSocketService:', error);
    webSocketService.logError('Uncaught Exception', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection in WebSocketService:', reason);
    webSocketService.logError('Unhandled Rejection', reason, { promise });
});

module.exports = webSocketService;