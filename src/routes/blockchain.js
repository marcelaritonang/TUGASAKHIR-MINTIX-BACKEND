// routes/blockchain.js
const express = require('express');
const router = express.Router();
const blockchainController = require('../controllers/blockchainController');
const auth = require('../middleware/auth');

// @route   POST /api/blockchain/verify-transaction
// @desc    Verify a transaction on the blockchain
// @access  Public
router.post('/verify-transaction', blockchainController.verifyTransaction);

// @route   GET /api/blockchain/transaction/:signature
// @desc    Get transaction details from the blockchain
// @access  Public
router.get('/transaction/:signature', blockchainController.getTransactionInfo);

// @route   PUT /api/blockchain/update-ticket-transaction
// @desc    Update a ticket with a real blockchain transaction
// @access  Private
router.put('/update-ticket-transaction', auth, blockchainController.updateTicketTransaction);

// @route   POST /api/blockchain/create-ticket-transaction
// @desc    Create a real blockchain transaction for a ticket
// @access  Private
router.post('/create-ticket-transaction', auth, blockchainController.createTicketTransaction);

module.exports = router;