// routes/tickets.js
const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController'); // Perbaiki nama controller
const auth = require('../middleware/auth'); // Tambahkan middleware auth

// @route   POST /api/tickets/mint
// @desc    Mint a ticket
// @access  Private
router.post('/mint', auth, ticketController.mintTicket); // Gunakan controller sebenarnya dan auth middleware

// @route   GET /api/tickets
// @desc    Get my tickets
// @access  Private
router.get('/', auth, ticketController.getMyTickets); // Gunakan controller sebenarnya dan auth middleware

// @route   PUT /api/tickets/:id/verify
// @desc    Verify a ticket
// @access  Private
router.put('/:id/verify', auth, ticketController.verifyTicket); // Gunakan controller sebenarnya dan auth middleware

// @route   GET /api/tickets/concerts/:concertId/minted-seats
// @desc    Get all minted seats for a concert
// @access  Public
router.get('/concerts/:concertId/minted-seats', ticketController.getMintedSeatsForConcert);

module.exports = router;