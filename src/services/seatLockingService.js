// backend/src/services/seatLockingService.js - IMPROVED PRODUCTION VERSION
const EventEmitter = require('events');

class SeatLockingService extends EventEmitter {
    constructor() {
        super();

        // Layer 1: In-Memory Temporary Locks (JavaScript Map)
        this.temporaryLocks = new Map();
        this.lockDuration = parseInt(process.env.SEAT_LOCK_DURATION) || 5 * 60 * 1000; // 5 minutes

        // Layer 2: Processing Locks (untuk mint operations)
        this.processingLocks = new Map();
        this.processingDuration = parseInt(process.env.PROCESSING_LOCK_DURATION) || 2 * 60 * 1000; // 2 minutes

        // **NEW: User lock tracking untuk prevent multiple locks per user**
        this.userLocks = new Map(); // userId -> Set of seatKeys

        // **NEW: Lock expiration warnings**
        this.warningTimers = new Map(); // seatKey -> timerId

        // Cleanup timer
        this.cleanupInterval = null;
        this.cleanupIntervalDuration = parseInt(process.env.CLEANUP_INTERVAL) || 30000; // 30 seconds

        // **NEW: Performance monitoring**
        this.stats = {
            totalLocksCreated: 0,
            totalLocksExpired: 0,
            totalConflicts: 0,
            peakConcurrentLocks: 0,
            lastCleanupDuration: 0
        };

        this.startCleanupTimer();
        console.log('🔒 Enhanced Hybrid Seat Locking Service initialized');
    }

    /**
     * **IMPROVED**: Lock seat temporarily dengan enhanced conflict detection
     */
    lockSeatTemporarily(concertId, sectionName, seatNumber, userId, duration = null) {
        // **NEW: Input validation**
        if (!concertId || !sectionName || !seatNumber || !userId) {
            throw new Error('Missing required parameters for seat locking');
        }

        const lockDuration = duration || this.lockDuration;
        const seatKey = this.generateSeatKey(concertId, sectionName, seatNumber);
        const now = Date.now();

        console.log(`🔒 Attempting to lock seat: ${seatKey} for user ${userId}`);

        // **NEW: Check if user already has too many active locks (prevent spam)**
        const userActiveLocks = this.getUserActiveLocks(userId);
        const maxLocksPerUser = parseInt(process.env.MAX_LOCKS_PER_USER) || 3;

        if (userActiveLocks.size >= maxLocksPerUser) {
            console.log(`❌ User ${userId} exceeded max locks (${userActiveLocks.size}/${maxLocksPerUser})`);
            this.stats.totalConflicts++;
            return {
                success: false,
                reason: 'max_locks_exceeded',
                maxAllowed: maxLocksPerUser,
                currentLocks: userActiveLocks.size
            };
        }

        // Check if seat is already locked
        const existingLock = this.temporaryLocks.get(seatKey);
        if (existingLock && !this.isLockExpired(existingLock, now)) {
            if (existingLock.userId === userId) {
                // Extend lock for same user
                existingLock.expiresAt = now + lockDuration;
                existingLock.renewedAt = now;
                existingLock.renewCount = (existingLock.renewCount || 0) + 1;

                // **NEW: Reset warning timer**
                this.scheduleExpirationWarning(seatKey, existingLock);

                console.log(`🔄 Extended seat lock: ${seatKey} for user ${userId} (renew #${existingLock.renewCount})`);

                this.emit('lockExtended', {
                    seatKey,
                    userId,
                    concertId,
                    sectionName,
                    seatNumber,
                    expiresAt: existingLock.expiresAt,
                    renewCount: existingLock.renewCount
                });

                return {
                    success: true,
                    type: 'extended',
                    expiresAt: existingLock.expiresAt,
                    timeRemaining: lockDuration,
                    renewCount: existingLock.renewCount
                };
            } else {
                // Seat locked by different user
                console.log(`❌ Seat lock conflict: ${seatKey} locked by ${existingLock.userId}, requested by ${userId}`);
                this.stats.totalConflicts++;

                return {
                    success: false,
                    reason: 'seat_locked',
                    lockedBy: 'other_user',
                    expiresAt: existingLock.expiresAt,
                    timeRemaining: existingLock.expiresAt - now,
                    lockedSince: existingLock.lockedAt
                };
            }
        }

        // **NEW: Check for processing lock conflict**
        const processingLock = this.processingLocks.get(seatKey);
        if (processingLock && !this.isLockExpired(processingLock, now)) {
            console.log(`❌ Seat being processed: ${seatKey} by ${processingLock.userId}`);
            this.stats.totalConflicts++;

            return {
                success: false,
                reason: 'seat_processing',
                processingBy: 'other_user',
                expiresAt: processingLock.expiresAt,
                timeRemaining: processingLock.expiresAt - now,
                operationType: processingLock.operationType
            };
        }

        // Create new lock
        const lockData = {
            seatKey,
            userId,
            concertId,
            sectionName,
            seatNumber,
            lockedAt: now,
            expiresAt: now + lockDuration,
            renewedAt: now,
            lockType: 'selection',
            status: 'active',
            renewCount: 0,
            userAgent: process.env.NODE_ENV === 'development' ? 'dev' : 'production', // **NEW: track origin**
            lockId: `${now}_${Math.random().toString(36).substr(2, 9)}` // **NEW: unique lock ID**
        };

        this.temporaryLocks.set(seatKey, lockData);

        // **NEW: Track user locks**
        this.addUserLock(userId, seatKey);

        // **NEW: Schedule expiration warning**
        this.scheduleExpirationWarning(seatKey, lockData);

        // **NEW: Update statistics**
        this.stats.totalLocksCreated++;
        this.updatePeakLocks();

        console.log(`✅ Created seat lock: ${seatKey} for user ${userId} (expires in ${lockDuration / 1000}s) [ID: ${lockData.lockId}]`);

        // Emit lock event for real-time updates
        this.emit('seatLocked', {
            seatKey,
            userId,
            concertId,
            sectionName,
            seatNumber,
            expiresAt: lockData.expiresAt,
            lockType: 'selection',
            lockId: lockData.lockId
        });

        return {
            success: true,
            type: 'created',
            expiresAt: lockData.expiresAt,
            timeRemaining: lockDuration,
            lockId: lockData.lockId
        };
    }

    /**
     * **IMPROVED**: Lock seat for processing dengan better conflict handling
     */
    lockSeatForProcessing(concertId, sectionName, seatNumber, userId, operationType = 'mint') {
        if (!concertId || !sectionName || !seatNumber || !userId) {
            throw new Error('Missing required parameters for processing lock');
        }

        const seatKey = this.generateSeatKey(concertId, sectionName, seatNumber);
        const now = Date.now();

        console.log(`⚙️ Attempting to lock seat for processing: ${seatKey} by ${userId} (${operationType})`);

        // Check if already processing
        const existingProcessing = this.processingLocks.get(seatKey);
        if (existingProcessing && !this.isLockExpired(existingProcessing, now)) {
            if (existingProcessing.userId === userId) {
                // Extend processing lock for same user
                existingProcessing.expiresAt = now + this.processingDuration;
                existingProcessing.renewCount = (existingProcessing.renewCount || 0) + 1;

                console.log(`🔄 Extended processing lock: ${seatKey} for ${userId} (renew #${existingProcessing.renewCount})`);
                return {
                    success: true,
                    type: 'extended',
                    renewCount: existingProcessing.renewCount,
                    expiresAt: existingProcessing.expiresAt
                };
            } else {
                // Processing by different user
                console.log(`❌ Processing conflict: ${seatKey} processing by ${existingProcessing.userId}`);
                this.stats.totalConflicts++;

                return {
                    success: false,
                    reason: 'processing_conflict',
                    processingBy: 'other_user',
                    operation: existingProcessing.operationType,
                    expiresAt: existingProcessing.expiresAt,
                    timeRemaining: existingProcessing.expiresAt - now
                };
            }
        }

        // **NEW: Validate user has temporary lock before processing**
        const tempLock = this.temporaryLocks.get(seatKey);
        if (!tempLock || tempLock.userId !== userId) {
            console.log(`❌ No valid temporary lock for processing: ${seatKey} by ${userId}`);
            return {
                success: false,
                reason: 'no_temporary_lock',
                message: 'Must have temporary lock before processing'
            };
        }

        // Remove temporary lock and create processing lock
        this.temporaryLocks.delete(seatKey);
        this.removeUserLock(userId, seatKey);
        this.clearExpirationWarning(seatKey);

        const processingData = {
            seatKey,
            userId,
            concertId,
            sectionName,
            seatNumber,
            lockedAt: now,
            expiresAt: now + this.processingDuration,
            lockType: 'processing',
            operationType,
            status: 'processing',
            renewCount: 0,
            previousLockId: tempLock.lockId, // **NEW: track lock history**
            processingId: `proc_${now}_${Math.random().toString(36).substr(2, 9)}`
        };

        this.processingLocks.set(seatKey, processingData);

        console.log(`✅ Created processing lock: ${seatKey} for ${operationType} by ${userId} [ID: ${processingData.processingId}]`);

        // Emit processing event
        this.emit('seatProcessing', {
            seatKey,
            userId,
            concertId,
            sectionName,
            seatNumber,
            operationType,
            expiresAt: processingData.expiresAt,
            processingId: processingData.processingId
        });

        return {
            success: true,
            type: 'processing',
            expiresAt: processingData.expiresAt,
            operationType,
            processingId: processingData.processingId
        };
    }

    /**
     * **IMPROVED**: Release lock dengan better cleanup
     */
    unlockSeat(concertId, sectionName, seatNumber, userId, force = false) {
        const seatKey = this.generateSeatKey(concertId, sectionName, seatNumber);

        console.log(`🔓 Attempting to unlock seat: ${seatKey} by ${userId}${force ? ' (FORCED)' : ''}`);

        let released = false;
        let lockType = null;

        // Check and remove temporary lock
        const tempLock = this.temporaryLocks.get(seatKey);
        if (tempLock && (tempLock.userId === userId || force)) {
            this.temporaryLocks.delete(seatKey);
            this.removeUserLock(userId, seatKey);
            this.clearExpirationWarning(seatKey);

            released = true;
            lockType = 'temporary';

            console.log(`✅ Released temporary lock: ${seatKey} by ${userId} [ID: ${tempLock.lockId}]`);

            this.emit('seatUnlocked', {
                seatKey,
                userId,
                concertId,
                sectionName,
                seatNumber,
                lockType: 'selection',
                lockId: tempLock.lockId,
                duration: Date.now() - tempLock.lockedAt
            });
        }

        // Check and remove processing lock
        const processingLock = this.processingLocks.get(seatKey);
        if (processingLock && (processingLock.userId === userId || force)) {
            this.processingLocks.delete(seatKey);

            released = true;
            lockType = 'processing';

            console.log(`✅ Released processing lock: ${seatKey} by ${userId} [ID: ${processingLock.processingId}]`);

            this.emit('seatUnlocked', {
                seatKey,
                userId,
                concertId,
                sectionName,
                seatNumber,
                lockType: 'processing',
                processingId: processingLock.processingId,
                operationType: processingLock.operationType,
                duration: Date.now() - processingLock.lockedAt
            });
        }

        if (!released) {
            console.log(`❌ No lock found to release for ${seatKey} by ${userId}`);
            return { success: false, reason: 'not_found_or_unauthorized' };
        }

        return { success: true, type: lockType };
    }

    /**
     * **NEW**: Helper methods for user lock tracking
     */
    addUserLock(userId, seatKey) {
        if (!this.userLocks.has(userId)) {
            this.userLocks.set(userId, new Set());
        }
        this.userLocks.get(userId).add(seatKey);
    }

    removeUserLock(userId, seatKey) {
        if (this.userLocks.has(userId)) {
            this.userLocks.get(userId).delete(seatKey);

            // Clean up empty sets
            if (this.userLocks.get(userId).size === 0) {
                this.userLocks.delete(userId);
            }
        }
    }

    getUserActiveLocks(userId) {
        return this.userLocks.get(userId) || new Set();
    }

    /**
     * **NEW**: Expiration warning system
     */
    scheduleExpirationWarning(seatKey, lockData) {
        // Clear existing warning
        this.clearExpirationWarning(seatKey);

        const warningTime = lockData.expiresAt - 30000; // 30 seconds before expiration
        const now = Date.now();

        if (warningTime > now) {
            const warningTimer = setTimeout(() => {
                this.emit('lockExpiring', {
                    seatKey: lockData.seatKey,
                    userId: lockData.userId,
                    concertId: lockData.concertId,
                    sectionName: lockData.sectionName,
                    seatNumber: lockData.seatNumber,
                    expiresAt: lockData.expiresAt,
                    timeRemaining: 30000
                });
            }, warningTime - now);

            this.warningTimers.set(seatKey, warningTimer);
        }
    }

    clearExpirationWarning(seatKey) {
        const timer = this.warningTimers.get(seatKey);
        if (timer) {
            clearTimeout(timer);
            this.warningTimers.delete(seatKey);
        }
    }

    /**
     * **IMPROVED**: Enhanced cleanup dengan performance monitoring
     */
    cleanupExpiredLocks() {
        const cleanupStart = Date.now();
        const now = Date.now();
        let cleanedCount = 0;
        let warningsCleared = 0;

        // Cleanup temporary locks
        for (const [seatKey, lock] of this.temporaryLocks.entries()) {
            if (this.isLockExpired(lock, now)) {
                this.temporaryLocks.delete(seatKey);
                this.removeUserLock(lock.userId, seatKey);
                this.clearExpirationWarning(seatKey);
                cleanedCount++;
                warningsCleared++;

                this.emit('lockExpired', {
                    seatKey,
                    lockType: 'selection',
                    userId: lock.userId,
                    concertId: lock.concertId,
                    sectionName: lock.sectionName,
                    seatNumber: lock.seatNumber,
                    expiredAt: lock.expiresAt,
                    lockId: lock.lockId,
                    duration: lock.expiresAt - lock.lockedAt
                });
            }
        }

        // Cleanup processing locks
        for (const [seatKey, lock] of this.processingLocks.entries()) {
            if (this.isLockExpired(lock, now)) {
                this.processingLocks.delete(seatKey);
                cleanedCount++;

                this.emit('lockExpired', {
                    seatKey,
                    lockType: 'processing',
                    userId: lock.userId,
                    concertId: lock.concertId,
                    sectionName: lock.sectionName,
                    seatNumber: lock.seatNumber,
                    operationType: lock.operationType,
                    expiredAt: lock.expiresAt,
                    processingId: lock.processingId,
                    duration: lock.expiresAt - lock.lockedAt
                });
            }
        }

        // **NEW: Cleanup orphaned warning timers**
        for (const [seatKey, timer] of this.warningTimers.entries()) {
            if (!this.temporaryLocks.has(seatKey) && !this.processingLocks.has(seatKey)) {
                clearTimeout(timer);
                this.warningTimers.delete(seatKey);
                warningsCleared++;
            }
        }

        const cleanupDuration = Date.now() - cleanupStart;
        this.stats.lastCleanupDuration = cleanupDuration;
        this.stats.totalLocksExpired += cleanedCount;

        if (cleanedCount > 0 || warningsCleared > 0) {
            console.log(`🧹 Cleanup completed: ${cleanedCount} expired locks, ${warningsCleared} warnings cleared (${cleanupDuration}ms)`);
        }

        return cleanedCount;
    }

    /**
     * **NEW**: Performance monitoring
     */
    updatePeakLocks() {
        const currentTotal = this.temporaryLocks.size + this.processingLocks.size;
        if (currentTotal > this.stats.peakConcurrentLocks) {
            this.stats.peakConcurrentLocks = currentTotal;
        }
    }

    /**
     * **IMPROVED**: Enhanced system statistics
     */
    getSystemStats() {
        const now = Date.now();

        let activeTempLocks = 0;
        let activeProcessingLocks = 0;
        let expiredTempLocks = 0;
        let expiredProcessingLocks = 0;

        // Count temp locks
        for (const lock of this.temporaryLocks.values()) {
            if (this.isLockExpired(lock, now)) {
                expiredTempLocks++;
            } else {
                activeTempLocks++;
            }
        }

        // Count processing locks
        for (const lock of this.processingLocks.values()) {
            if (this.isLockExpired(lock, now)) {
                expiredProcessingLocks++;
            } else {
                activeProcessingLocks++;
            }
        }

        return {
            // Current state
            activeTempLocks,
            activeProcessingLocks,
            totalActiveLocks: activeTempLocks + activeProcessingLocks,
            expiredLocks: expiredTempLocks + expiredProcessingLocks,
            totalManagedLocks: this.temporaryLocks.size + this.processingLocks.size,

            // **NEW: User tracking**
            activeUsers: this.userLocks.size,
            totalUserLocks: Array.from(this.userLocks.values()).reduce((sum, locks) => sum + locks.size, 0),

            // **NEW: Warning system**
            pendingWarnings: this.warningTimers.size,

            // **NEW: Performance stats**
            ...this.stats,

            // System health
            memoryUsage: {
                tempLocks: this.temporaryLocks.size,
                processingLocks: this.processingLocks.size,
                userTracking: this.userLocks.size,
                warningTimers: this.warningTimers.size
            },

            timestamp: now
        };
    }

    /**
     * **IMPROVED**: Enhanced shutdown dengan proper cleanup
     */
    shutdown() {
        console.log('🔒 Starting seat locking service shutdown...');

        // Clear cleanup timer
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        // Clear all warning timers
        for (const timer of this.warningTimers.values()) {
            clearTimeout(timer);
        }
        this.warningTimers.clear();

        // Clear all locks and emit events
        const tempCount = this.temporaryLocks.size;
        const procCount = this.processingLocks.size;

        this.temporaryLocks.clear();
        this.processingLocks.clear();
        this.userLocks.clear();

        console.log(`🔒 Seat locking service shutdown complete - cleared ${tempCount} temp + ${procCount} processing locks`);

        this.emit('allLocksCleared', {
            tempCount,
            procCount,
            timestamp: Date.now(),
            reason: 'service_shutdown'
        });

        return { tempCount, procCount };
    }

    // **EXISTING METHODS** (unchanged)
    generateSeatKey(concertId, sectionName, seatNumber) {
        return `${concertId}-${sectionName}-${seatNumber}`;
    }

    isLockExpired(lock, currentTime = Date.now()) {
        return currentTime >= lock.expiresAt;
    }

    startCleanupTimer() {
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredLocks();
        }, this.cleanupIntervalDuration);

        console.log(`🕐 Started cleanup timer (${this.cleanupIntervalDuration / 1000}s interval)`);
    }

    checkSeatLockStatus(concertId, sectionName, seatNumber) {
        const seatKey = this.generateSeatKey(concertId, sectionName, seatNumber);
        const now = Date.now();

        // Check processing lock first (highest priority)
        const processingLock = this.processingLocks.get(seatKey);
        if (processingLock && !this.isLockExpired(processingLock, now)) {
            return {
                locked: true,
                lockType: 'processing',
                operation: processingLock.operationType,
                lockedBy: processingLock.userId,
                expiresAt: processingLock.expiresAt,
                timeRemaining: processingLock.expiresAt - now,
                processingId: processingLock.processingId
            };
        }

        // Check temporary lock
        const tempLock = this.temporaryLocks.get(seatKey);
        if (tempLock && !this.isLockExpired(tempLock, now)) {
            return {
                locked: true,
                lockType: 'selection',
                lockedBy: tempLock.userId,
                expiresAt: tempLock.expiresAt,
                timeRemaining: tempLock.expiresAt - now,
                lockId: tempLock.lockId,
                renewCount: tempLock.renewCount
            };
        }

        return {
            locked: false,
            available: true
        };
    }

    completeProcessing(concertId, sectionName, seatNumber, userId, success = true) {
        const seatKey = this.generateSeatKey(concertId, sectionName, seatNumber);

        // Remove both locks
        const tempLock = this.temporaryLocks.get(seatKey);
        const procLock = this.processingLocks.get(seatKey);

        this.temporaryLocks.delete(seatKey);
        this.processingLocks.delete(seatKey);
        this.removeUserLock(userId, seatKey);
        this.clearExpirationWarning(seatKey);

        const eventType = success ? 'seatMinted' : 'seatProcessingFailed';

        console.log(`${success ? '✅' : '❌'} Completed processing: ${seatKey} by ${userId} (${success ? 'SUCCESS' : 'FAILED'})`);

        this.emit(eventType, {
            seatKey,
            userId,
            concertId,
            sectionName,
            seatNumber,
            success,
            timestamp: Date.now(),
            processingId: procLock?.processingId,
            lockId: tempLock?.lockId
        });

        return { success: true };
    }

    getLocksForConcert(concertId) {
        const now = Date.now();
        const concertLocks = {
            temporaryLocks: [],
            processingLocks: [],
            activeLockCount: 0
        };

        // Get temporary locks for this concert
        for (const [seatKey, lock] of this.temporaryLocks.entries()) {
            if (lock.concertId === concertId && !this.isLockExpired(lock, now)) {
                concertLocks.temporaryLocks.push({
                    ...lock,
                    timeRemaining: lock.expiresAt - now
                });
                concertLocks.activeLockCount++;
            }
        }

        // Get processing locks for this concert
        for (const [seatKey, lock] of this.processingLocks.entries()) {
            if (lock.concertId === concertId && !this.isLockExpired(lock, now)) {
                concertLocks.processingLocks.push({
                    ...lock,
                    timeRemaining: lock.expiresAt - now
                });
                concertLocks.activeLockCount++;
            }
        }

        return concertLocks;
    }

    clearAllLocks() {
        const tempCount = this.temporaryLocks.size;
        const procCount = this.processingLocks.size;

        // Clear all warning timers
        for (const timer of this.warningTimers.values()) {
            clearTimeout(timer);
        }

        this.temporaryLocks.clear();
        this.processingLocks.clear();
        this.userLocks.clear();
        this.warningTimers.clear();

        console.log(`🚨 EMERGENCY: Force cleared all locks (${tempCount} temp + ${procCount} processing)`);

        this.emit('allLocksCleared', {
            tempCount,
            procCount,
            timestamp: Date.now(),
            reason: 'manual_clear'
        });

        return { tempCount, procCount };
    }
}

// Create singleton instance
const seatLockingService = new SeatLockingService();

// Enhanced graceful shutdown
const gracefulShutdown = (signal) => {
    console.log(`\n🛑 Received ${signal}, shutting down seat locking service...`);
    seatLockingService.shutdown();
    process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// **NEW: Handle uncaught errors**
process.on('uncaughtException', (error) => {
    console.error('🚨 Uncaught Exception in SeatLockingService:', error);
    seatLockingService.shutdown();
    process.exit(1);
});

module.exports = seatLockingService;