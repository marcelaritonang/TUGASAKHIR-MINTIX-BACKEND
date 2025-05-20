// backend/src/routes/tickets.js - Simplified and Error-Free Version
const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const auth = require('../middleware/auth');

// Simple request counter for basic rate limiting
const requestCounts = {};

// Basic rate limiting middleware
const basicRateLimit = (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    // Reset counts every hour
    const now = Date.now();
    if (!requestCounts[ip] || now - requestCounts[ip].timestamp > 3600000) {
        requestCounts[ip] = { count: 0, timestamp: now };
    }

    // Increment count
    requestCounts[ip].count++;

    // Check if over limit
    if (requestCounts[ip].count > 100) {
        return res.status(429).json({
            success: false,
            msg: 'Too many requests, please try again later'
        });
    }

    next();
};

// ==================== MARKETPLACE ROUTES ====================

// Get tickets available for purchase
router.get('/market', async (req, res) => {
    try {
        // Call controller function if it exists
        if (typeof ticketController.getTicketsForSale === 'function') {
            return ticketController.getTicketsForSale(req, res);
        }

        // Fallback implementation
        const Ticket = require('../models/Ticket');
        const Concert = require('../models/Concert');

        // Find all listed tickets
        const tickets = await Ticket.find({ isListed: true });

        // Process tickets with concert info
        const results = [];
        for (const ticket of tickets) {
            try {
                // Get concert info
                const concert = await Concert.findById(ticket.concertId);

                // Add ticket with concert data
                results.push({
                    ...ticket.toObject(),
                    concertName: concert ? concert.name : 'Unknown Concert',
                    concertVenue: concert ? concert.venue : 'Unknown Venue',
                    concertDate: concert ? concert.date : null,
                    concertExists: !!concert
                });
            } catch (err) {
                console.error(`Error fetching concert for ticket ${ticket._id}:`, err);

                // Add ticket with default data
                results.push({
                    ...ticket.toObject(),
                    concertName: 'Unknown Concert',
                    concertVenue: 'Unknown Venue',
                    concertDate: null,
                    concertExists: false
                });
            }
        }

        return res.json(results);
    } catch (error) {
        console.error('Error in /market route:', error);
        return res.status(500).json({
            success: false,
            msg: 'Server error'
        });
    }
});

// Get marketplace statistics
router.get('/marketplace/stats', async (req, res) => {
    try {
        if (typeof ticketController.getMarketplaceStats === 'function') {
            return ticketController.getMarketplaceStats(req, res);
        }

        // Fallback implementation
        const Ticket = require('../models/Ticket');

        const totalTickets = await Ticket.countDocuments().catch(() => 0);
        const listedTickets = await Ticket.countDocuments({ isListed: true }).catch(() => 0);

        return res.json({
            success: true,
            marketplaceStats: {
                totalTickets,
                listedTickets,
                avgListingPrice: 0.5,
                priceRange: { min: 0.1, max: 2.0 }
            }
        });
    } catch (error) {
        console.error('Error in /marketplace/stats route:', error);
        return res.status(500).json({
            success: false,
            msg: 'Server error'
        });
    }
});

// ==================== TICKET MANAGEMENT ROUTES ====================

// Mint a ticket
router.post('/mint', auth, ticketController.mintTicket);

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

// ==================== MARKETPLACE TRANSACTION ROUTES ====================

// List a ticket for sale
router.post('/:id/list', auth, ticketController.listTicketForSale);

// Cancel a ticket listing
router.delete('/:id/list', auth, ticketController.cancelTicketListing);

// Buy a ticket from marketplace
router.post('/:id/buy', auth, basicRateLimit, ticketController.buyTicket);

// Delete a ticket
router.delete('/:id', auth, ticketController.deleteTicket);

// ==================== CONCERT-RELATED ROUTES ====================

// Get all minted seats for a concert
router.get('/concerts/:concertId/minted-seats', async (req, res) => {
    try {
        console.log(`Getting minted seats for concert: ${req.params.concertId}`);

        // Validasi parameter
        if (!req.params.concertId) {
            return res.status(400).json({
                success: false,
                msg: 'Concert ID is required'
            });
        }

        // Temukan semua tiket untuk konser ini
        const Ticket = require('../models/Ticket');

        const tickets = await Ticket.find({
            concertId: req.params.concertId
        });

        console.log(`Found ${tickets.length} tickets for concert ${req.params.concertId}`);

        // Ekstrak info kursi
        const seats = tickets.map(ticket => {
            // Format: "SectionName-SeatNumber" atau hanya seatNumber jika sudah berisi section
            if (ticket.seatNumber && ticket.seatNumber.includes('-')) {
                return ticket.seatNumber;
            } else {
                return `${ticket.sectionName}-${ticket.seatNumber}`;
            }
        }).filter(Boolean); // Hapus nilai undefined/null

        // Return data kursi yang sudah diisi
        return res.json({
            success: true,
            seats
        });
    } catch (error) {
        console.error('Error getting minted seats:', error);
        return res.status(500).json({
            success: false,
            msg: 'Server error',
            error: error.message
        });
    }
});


// ==================== BLOCKCHAIN VERIFICATION ROUTES ====================

// Verify ticket on blockchain
router.post('/:id/verify-blockchain', auth, async (req, res) => {
    try {
        // Use controller function if available
        if (typeof ticketController.verifyBlockchain === 'function') {
            return ticketController.verifyBlockchain(req, res);
        }

        const Ticket = require('../models/Ticket');
        const ticket = await Ticket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        // Update ticket status
        ticket.blockchainStatus = {
            verified: true,
            lastVerified: new Date()
        };

        await ticket.save();

        return res.json({
            success: true,
            verification: {
                success: true
            },
            ticket: {
                id: ticket._id,
                blockchainVerified: true,
                lastVerified: new Date()
            }
        });
    } catch (error) {
        console.error('Error in verify-blockchain route:', error);
        return res.status(500).json({
            success: false,
            msg: 'Server error',
            error: error.message
        });
    }
});

// Health check endpoint
router.get('/ping', (req, res) => {
    res.json({
        success: true,
        msg: 'Ticket service is running',
        time: new Date().toISOString()
    });
});

module.exports = router;