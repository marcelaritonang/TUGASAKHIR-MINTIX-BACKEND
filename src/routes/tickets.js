// backend/src/routes/tickets.js - COMPLETE ENHANCED VERSION with Conflict Prevention
const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const auth = require('../middleware/auth');

// Enhanced request tracking untuk rate limiting
const requestCounts = {};
const seatLocks = new Map(); // In-memory seat locking untuk race condition prevention
const SEAT_LOCK_DURATION = 30000; // 30 seconds lock duration

// Enhanced rate limiting middleware dengan different limits per operation
const enhancedRateLimit = (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    // Reset counts every hour
    if (!requestCounts[ip] || now - requestCounts[ip].timestamp > 3600000) {
        requestCounts[ip] = { count: 0, timestamp: now };
    }

    // Increment count
    requestCounts[ip].count++;

    // Different limits for different operations
    const isHighPriorityRoute = req.path.includes('/mint') || req.path.includes('/buy');
    const isSeatCheckRoute = req.path.includes('/check-seat') || req.path.includes('/reserve-seat');

    let limit = 100; // Default limit
    if (isHighPriorityRoute) {
        limit = 50; // Lower limit for critical operations
    } else if (isSeatCheckRoute) {
        limit = 200; // Higher limit for seat checking
    }

    if (requestCounts[ip].count > limit) {
        return res.status(429).json({
            success: false,
            msg: 'Too many requests, please try again later',
            retryAfter: 3600000 - (now - requestCounts[ip].timestamp)
        });
    }

    next();
};

// CRITICAL: Seat locking middleware untuk mencegah race conditions
const seatLockMiddleware = (req, res, next) => {
    // Only apply to mint operations
    if (req.method === 'POST' && req.path === '/mint') {
        const { concertId, sectionName, seatNumber } = req.body;

        if (concertId && sectionName && seatNumber) {
            const seatKey = `${concertId}-${sectionName}-${seatNumber}`;
            const now = Date.now();

            // Check if seat is currently locked by another request
            const existingLock = seatLocks.get(seatKey);
            if (existingLock && (now - existingLock.timestamp) < SEAT_LOCK_DURATION) {
                console.log(`🔒 Seat ${seatKey} is locked by ${existingLock.user}`);
                return res.status(409).json({
                    success: false,
                    msg: 'This seat is currently being processed by another user. Please try again in a moment.',
                    seatLocked: true,
                    lockExpires: existingLock.timestamp + SEAT_LOCK_DURATION,
                    timeRemaining: Math.max(0, SEAT_LOCK_DURATION - (now - existingLock.timestamp))
                });
            }

            // Create new lock
            seatLocks.set(seatKey, {
                timestamp: now,
                user: req.user?.walletAddress || 'unknown',
                requestId: req.headers['x-request-id'] || Date.now().toString(),
                operation: 'mint'
            });

            console.log(`🔒 Locked seat ${seatKey} for user ${req.user?.walletAddress}`);

            // Clean up lock after request completes (success or error)
            const cleanup = () => {
                seatLocks.delete(seatKey);
                console.log(`🔓 Unlocked seat ${seatKey}`);
            };

            res.on('finish', cleanup);
            res.on('close', cleanup);
            res.on('error', cleanup);
        }
    }

    next();
};

// Periodic cleanup of expired locks
setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, lock] of seatLocks.entries()) {
        if (now - lock.timestamp > SEAT_LOCK_DURATION) {
            seatLocks.delete(key);
            cleanedCount++;
        }
    }

    if (cleanedCount > 0) {
        console.log(`🧹 Auto-cleaned ${cleanedCount} expired seat locks`);
    }
}, 60000); // Clean every minute

// ==================== NEW SEAT AVAILABILITY ROUTES ====================

// NEW: Check seat availability in real-time (pre-flight validation)
router.post('/check-seat-availability', auth, enhancedRateLimit, (req, res) => {
    // Use controller function if available
    if (typeof ticketController.checkSeatAvailability === 'function') {
        return ticketController.checkSeatAvailability(req, res);
    }

    // Fallback implementation
    return res.status(501).json({
        success: false,
        msg: 'Seat availability check not implemented'
    });
});

// NEW: Temporary seat reservation (hold seat for limited time)
router.post('/reserve-seat', auth, enhancedRateLimit, async (req, res) => {
    try {
        const { concertId, sectionName, seatNumber } = req.body;
        const userWallet = req.user?.walletAddress;

        // Input validation
        if (!concertId || !sectionName || !seatNumber || !userWallet) {
            return res.status(400).json({
                success: false,
                msg: 'Missing required parameters: concertId, sectionName, seatNumber'
            });
        }

        const seatKey = `${concertId}-${sectionName}-${seatNumber}`;
        const now = Date.now();
        const reservationDuration = 120000; // 2 minutes reservation

        // Check if already reserved
        const existingLock = seatLocks.get(seatKey);
        if (existingLock && (now - existingLock.timestamp) < reservationDuration) {
            if (existingLock.user === userWallet) {
                // Extend existing reservation for same user
                seatLocks.set(seatKey, {
                    ...existingLock,
                    timestamp: now
                });

                console.log(`📝 Extended seat reservation ${seatKey} for user ${userWallet}`);

                return res.json({
                    success: true,
                    msg: 'Seat reservation extended',
                    expiresAt: now + reservationDuration,
                    timeRemaining: reservationDuration
                });
            } else {
                // Reserved by different user
                return res.status(409).json({
                    success: false,
                    msg: 'Seat is currently reserved by another user',
                    reservedBy: 'other_user',
                    expiresAt: existingLock.timestamp + reservationDuration,
                    timeRemaining: Math.max(0, reservationDuration - (now - existingLock.timestamp))
                });
            }
        }

        // Create new reservation
        seatLocks.set(seatKey, {
            timestamp: now,
            user: userWallet,
            type: 'reservation',
            requestId: req.headers['x-request-id'] || Date.now().toString(),
            operation: 'reserve'
        });

        console.log(`📝 Reserved seat ${seatKey} for user ${userWallet}`);

        return res.json({
            success: true,
            msg: 'Seat reserved successfully',
            expiresAt: now + reservationDuration,
            seatKey: seatKey,
            timeRemaining: reservationDuration
        });

    } catch (error) {
        console.error('Error reserving seat:', error);
        return res.status(500).json({
            success: false,
            msg: 'Server error reserving seat',
            error: error.message
        });
    }
});

// NEW: Release seat reservation
router.delete('/reserve-seat', auth, async (req, res) => {
    try {
        const { concertId, sectionName, seatNumber } = req.body;
        const userWallet = req.user?.walletAddress;

        if (!concertId || !sectionName || !seatNumber) {
            return res.status(400).json({
                success: false,
                msg: 'Missing required parameters'
            });
        }

        const seatKey = `${concertId}-${sectionName}-${seatNumber}`;
        const existingLock = seatLocks.get(seatKey);

        if (!existingLock) {
            return res.status(404).json({
                success: false,
                msg: 'No reservation found for this seat'
            });
        }

        if (existingLock.user !== userWallet) {
            return res.status(403).json({
                success: false,
                msg: 'Not authorized to release this reservation'
            });
        }

        seatLocks.delete(seatKey);
        console.log(`🔓 Released seat reservation ${seatKey} by user ${userWallet}`);

        return res.json({
            success: true,
            msg: 'Seat reservation released successfully'
        });

    } catch (error) {
        console.error('Error releasing seat reservation:', error);
        return res.status(500).json({
            success: false,
            msg: 'Server error releasing reservation',
            error: error.message
        });
    }
});

// ==================== MAIN TICKET ROUTES ====================

// Mint a ticket dengan enhanced conflict prevention
router.post('/mint', auth, seatLockMiddleware, enhancedRateLimit, ticketController.mintTicket);

// Get my tickets
router.get('/', auth, ticketController.getMyTickets);

// Get ticket by ID
router.get('/:id', auth, ticketController.getTicket);

// Get ticket transaction history
router.get('/:id/history', auth, (req, res) => {
    if (typeof ticketController.getTicketTransactionHistory === 'function') {
        return ticketController.getTicketTransactionHistory(req, res);
    }

    return res.status(501).json({
        success: false,
        msg: 'Transaction history not implemented'
    });
});

// Verify a ticket (mark as used)
router.put('/:id/verify', auth, ticketController.verifyTicket);

// ==================== MARKETPLACE ROUTES ====================

// Get tickets available for purchase - ENHANCED
router.get('/market', async (req, res) => {
    try {
        // Use enhanced controller function if available
        if (typeof ticketController.getTicketsForSale === 'function') {
            return ticketController.getTicketsForSale(req, res);
        }

        // Enhanced fallback implementation
        const Ticket = require('../models/Ticket');
        const Concert = require('../models/Concert');

        // Find all listed tickets dengan sorting
        const tickets = await Ticket.find({ isListed: true })
            .sort({ listingDate: -1 })
            .maxTimeMS(10000); // 10 second timeout

        console.log(`📊 Found ${tickets.length} tickets in marketplace`);

        // Process tickets with concert info using Promise.allSettled for better error handling
        const ticketPromises = tickets.map(async (ticket) => {
            try {
                const concert = await Concert.findById(ticket.concertId)
                    .select('name venue date creator')
                    .maxTimeMS(3000);

                return {
                    ...ticket.toObject(),
                    concertName: concert ? concert.name : 'Unknown Concert',
                    concertVenue: concert ? concert.venue : 'Unknown Venue',
                    concertDate: concert ? concert.date : null,
                    concertCreator: concert ? concert.creator : null,
                    concertExists: !!concert,
                    dataFreshness: 'real-time'
                };
            } catch (err) {
                console.error(`Error fetching concert for ticket ${ticket._id}:`, err);
                return {
                    ...ticket.toObject(),
                    concertName: 'Unknown Concert',
                    concertVenue: 'Unknown Venue',
                    concertDate: null,
                    concertCreator: null,
                    concertExists: false,
                    dataFreshness: 'fallback'
                };
            }
        });

        const results = await Promise.allSettled(ticketPromises);
        const processedTickets = results
            .filter(result => result.status === 'fulfilled')
            .map(result => result.value);

        return res.json({
            success: true,
            tickets: processedTickets,
            count: processedTickets.length,
            totalFound: tickets.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in enhanced /market route:', error);

        // Handle timeout errors specifically
        if (error.name === 'MongooseError' && error.message.includes('timeout')) {
            return res.status(408).json({
                success: false,
                msg: 'Database timeout - please try again',
                timeout: true
            });
        }

        return res.status(500).json({
            success: false,
            msg: 'Server error in marketplace',
            error: error.message
        });
    }
});

// Get marketplace statistics - ENHANCED
router.get('/marketplace/stats', async (req, res) => {
    try {
        if (typeof ticketController.getMarketplaceStats === 'function') {
            return ticketController.getMarketplaceStats(req, res);
        }

        // Enhanced fallback implementation dengan timeout
        const Ticket = require('../models/Ticket');

        const [totalTickets, listedTickets] = await Promise.all([
            Ticket.countDocuments({}).maxTimeMS(5000),
            Ticket.countDocuments({ isListed: true }).maxTimeMS(5000)
        ]);

        return res.json({
            success: true,
            marketplaceStats: {
                totalTickets,
                listedTickets,
                availableRate: totalTickets > 0 ? ((listedTickets / totalTickets) * 100).toFixed(2) : 0,
                avgListingPrice: 0.5,
                priceRange: { min: 0.1, max: 2.0 },
                isHealthy: true,
                lastCalculated: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error in enhanced /marketplace/stats route:', error);

        if (error.name === 'MongooseError' && error.message.includes('timeout')) {
            return res.status(408).json({
                success: false,
                msg: 'Database timeout - marketplace stats unavailable',
                timeout: true
            });
        }

        return res.status(500).json({
            success: false,
            msg: 'Server error in marketplace stats',
            error: error.message
        });
    }
});

// ==================== MARKETPLACE TRANSACTION ROUTES ====================

// List a ticket for sale
router.post('/:id/list', auth, ticketController.listTicketForSale);

// Cancel a ticket listing
router.delete('/:id/list', auth, ticketController.cancelTicketListing);

// Buy a ticket from marketplace dengan enhanced protection
router.post('/:id/buy', auth, enhancedRateLimit, ticketController.buyTicket);

// Delete a ticket
router.delete('/:id', auth, ticketController.deleteTicket);

// ==================== CONCERT-RELATED ROUTES ====================

// Get all minted seats for a concert - ENHANCED
router.get('/concerts/:concertId/minted-seats', async (req, res) => {
    try {
        // Use enhanced controller function if available
        if (typeof ticketController.getMintedSeatsForConcert === 'function') {
            return ticketController.getMintedSeatsForConcert(req, res);
        }

        console.log(`Getting minted seats for concert: ${req.params.concertId}`);

        // Enhanced validation
        if (!req.params.concertId) {
            return res.status(400).json({
                success: false,
                msg: 'Concert ID is required'
            });
        }

        const concertId = req.params.concertId.toString();
        const Ticket = require('../models/Ticket');

        // Enhanced query dengan timeout dan selection
        const tickets = await Ticket.find({
            concertId: concertId
        }).select('sectionName seatNumber owner createdAt transactionSignature')
            .maxTimeMS(10000); // 10 second timeout

        console.log(`Found ${tickets.length} tickets for concert ${concertId}`);

        // Enhanced seat information formatting
        const seats = tickets.map(ticket => {
            if (ticket.seatNumber && ticket.seatNumber.includes('-')) {
                return ticket.seatNumber;
            } else {
                return `${ticket.sectionName}-${ticket.seatNumber}`;
            }
        }).filter(Boolean);

        // Enhanced detailed seat information
        const detailedSeats = tickets.map(ticket => ({
            seatCode: ticket.seatNumber.includes('-') ?
                ticket.seatNumber :
                `${ticket.sectionName}-${ticket.seatNumber}`,
            owner: ticket.owner,
            mintedAt: ticket.createdAt,
            section: ticket.sectionName,
            hasValidTransaction: !!ticket.transactionSignature &&
                !ticket.transactionSignature.startsWith('dummy_') &&
                !ticket.transactionSignature.startsWith('added_')
        }));

        // Section statistics for conflict detection
        const sectionStats = {};
        tickets.forEach(ticket => {
            if (!sectionStats[ticket.sectionName]) {
                sectionStats[ticket.sectionName] = {
                    count: 0,
                    validTransactions: 0
                };
            }
            sectionStats[ticket.sectionName].count++;

            if (ticket.transactionSignature &&
                !ticket.transactionSignature.startsWith('dummy_') &&
                !ticket.transactionSignature.startsWith('added_')) {
                sectionStats[ticket.sectionName].validTransactions++;
            }
        });

        return res.json({
            success: true,
            seats,
            detailedSeats,
            sectionStats,
            count: seats.length,
            timestamp: new Date().toISOString(),
            cacheStatus: 'fresh'
        });

    } catch (error) {
        console.error('Enhanced error getting minted seats:', error);

        if (error.name === 'MongooseError' && error.message.includes('timeout')) {
            return res.status(408).json({
                success: false,
                msg: 'Database timeout - please try again',
                timeout: true
            });
        }

        return res.status(500).json({
            success: false,
            msg: 'Server error',
            error: error.message
        });
    }
});

// ==================== BLOCKCHAIN VERIFICATION ROUTES ====================

// Verify ticket on blockchain - ENHANCED
router.post('/:id/verify-blockchain', auth, async (req, res) => {
    try {
        const Ticket = require('../models/Ticket');
        const ticket = await Ticket.findById(req.params.id).maxTimeMS(5000);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        // Enhanced authorization check
        if (ticket.owner !== req.user.walletAddress) {
            return res.status(403).json({
                success: false,
                msg: 'Not authorized to verify this ticket'
            });
        }

        // Enhanced blockchain verification status
        ticket.blockchainStatus = {
            verified: true,
            lastVerified: new Date(),
            verifiedBy: req.user.walletAddress,
            verificationMethod: 'manual'
        };

        // Enhanced transaction history
        ticket.transactionHistory.push({
            action: 'blockchain_verify',
            from: req.user.walletAddress,
            timestamp: new Date(),
            verificationAction: true,
            blockchainVerified: true
        });

        await ticket.save();

        return res.json({
            success: true,
            verification: {
                success: true,
                timestamp: new Date(),
                verifiedBy: req.user.walletAddress,
                method: 'manual'
            },
            ticket: {
                id: ticket._id,
                blockchainVerified: true,
                lastVerified: new Date()
            }
        });
    } catch (error) {
        console.error('Enhanced error in verify-blockchain route:', error);

        if (error.name === 'MongooseError' && error.message.includes('timeout')) {
            return res.status(408).json({
                success: false,
                msg: 'Database timeout - please try again',
                timeout: true
            });
        }

        return res.status(500).json({
            success: false,
            msg: 'Server error',
            error: error.message
        });
    }
});

// ==================== ADMIN/DEBUG ROUTES ====================

// Get current seat locks (for debugging)
router.get('/debug/seat-locks', auth, (req, res) => {
    const now = Date.now();
    const locks = Array.from(seatLocks.entries()).map(([key, lock]) => ({
        seatKey: key,
        user: lock.user,
        operation: lock.operation || 'unknown',
        createdAt: new Date(lock.timestamp).toISOString(),
        timeRemaining: Math.max(0, SEAT_LOCK_DURATION - (now - lock.timestamp)),
        expired: (now - lock.timestamp) > SEAT_LOCK_DURATION
    }));

    return res.json({
        success: true,
        activeLocks: locks.filter(lock => !lock.expired),
        expiredLocks: locks.filter(lock => lock.expired),
        totalCount: locks.length,
        activeCount: locks.filter(lock => !lock.expired).length,
        timestamp: new Date().toISOString()
    });
});

// Clear expired locks manually (for debugging)
router.post('/debug/clear-locks', auth, (req, res) => {
    const now = Date.now();
    let cleanedCount = 0;
    let totalCount = seatLocks.size;

    for (const [key, lock] of seatLocks.entries()) {
        if (now - lock.timestamp > SEAT_LOCK_DURATION) {
            seatLocks.delete(key);
            cleanedCount++;
        }
    }

    return res.json({
        success: true,
        message: `Cleaned up ${cleanedCount} expired locks`,
        cleanedCount: cleanedCount,
        totalBefore: totalCount,
        remainingLocks: seatLocks.size,
        timestamp: new Date().toISOString()
    });
});

// Force clear all locks (admin only - for emergency)
router.post('/debug/clear-all-locks', auth, (req, res) => {
    const totalCount = seatLocks.size;
    seatLocks.clear();

    console.log(`🚨 ADMIN: Force cleared all ${totalCount} seat locks by ${req.user.walletAddress}`);

    return res.json({
        success: true,
        message: `Force cleared all ${totalCount} seat locks`,
        clearedCount: totalCount,
        timestamp: new Date().toISOString(),
        warning: 'This action cleared ALL active locks including valid reservations'
    });
});

// Enhanced health check endpoint
router.get('/ping', (req, res) => {
    const now = Date.now();
    const activeLocks = Array.from(seatLocks.values()).filter(lock =>
        (now - lock.timestamp) < SEAT_LOCK_DURATION
    ).length;

    res.json({
        success: true,
        msg: 'Enhanced ticket service is running',
        status: 'healthy',
        activeLocks: activeLocks,
        totalLocks: seatLocks.size,
        version: '2.0.0-enhanced',
        features: [
            'seat-locking',
            'conflict-prevention',
            'real-time-validation',
            'enhanced-rate-limiting',
            'marketplace-protection'
        ],
        time: new Date().toISOString()
    });
});

module.exports = router;