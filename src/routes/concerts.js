// backend/src/routes/concerts.js - FIXED VERSION with Enhanced Error Handling
const express = require('express');
const router = express.Router();
const concertController = require('../controllers/concertController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const multer = require('multer');

// Setup multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// IMPORTANT: Specific routes first, then dynamic routes

// @route   GET /api/concerts/pending
// @desc    Get pending concerts
// @access  Private (Admin)
router.get('/pending', auth, adminAuth, concertController.getPendingConcerts);

// @route   GET /api/concerts/me/pending
// @desc    Get my pending concerts
// @access  Private
router.get('/me/pending', auth, concertController.getMyPendingConcerts);

// @route   GET /api/concerts
// @desc    Get all approved concerts
// @access  Public
router.get('/', concertController.getConcerts);

// ENHANCED: Add minted seats route BEFORE dynamic :id route
// @route   GET /api/concerts/:concertId/minted-seats
// @desc    Get minted seats for a concert
// @access  Public
router.get('/:concertId/minted-seats', async (req, res) => {
    try {
        const concertId = req.params.concertId;
        console.log(`🎫 Getting minted seats for concert: ${concertId}`);

        if (!concertId) {
            return res.status(400).json({
                success: false,
                msg: 'Concert ID is required'
            });
        }

        const Ticket = require('../models/Ticket');

        // Enhanced query with timeout
        const tickets = await Ticket.find({ concertId })
            .select('sectionName seatNumber owner createdAt transactionSignature')
            .maxTimeMS(10000);

        console.log(`Found ${tickets.length} tickets for concert ${concertId}`);

        // Enhanced seat formatting
        const seats = tickets.map(ticket => {
            if (ticket.seatNumber && ticket.seatNumber.includes('-')) {
                return ticket.seatNumber;
            } else {
                return `${ticket.sectionName}-${ticket.seatNumber}`;
            }
        }).filter(Boolean);

        // Enhanced response with detailed info
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

        res.json({
            success: true,
            seats,
            detailedSeats,
            count: seats.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error getting minted seats:', error);

        if (error.name === 'MongooseError' && error.message.includes('timeout')) {
            return res.status(408).json({
                success: false,
                msg: 'Database timeout - please try again',
                timeout: true
            });
        }

        res.status(500).json({
            success: false,
            msg: 'Server error getting minted seats',
            error: error.message
        });
    }
});

// ENHANCED: Manual concert by ID route with fallback
// @route   GET /api/concerts/:id
// @desc    Get concert by ID with enhanced error handling
// @access  Public
router.get('/:id', async (req, res) => {
    try {
        const concertId = req.params.id;
        console.log(`🎵 Getting concert by ID: ${concertId}`);

        if (!concertId) {
            return res.status(400).json({
                success: false,
                msg: 'Concert ID is required'
            });
        }

        // Try controller first
        if (typeof concertController.getConcert === 'function') {
            console.log('📞 Using concert controller...');
            return concertController.getConcert(req, res);
        }

        // FALLBACK: Manual implementation
        console.log('🔧 Using manual concert fetch...');
        const Concert = require('../models/Concert');

        let concert;
        try {
            concert = await Concert.findById(concertId).maxTimeMS(10000);
        } catch (dbError) {
            console.error('Database error:', dbError);

            if (dbError.kind === 'ObjectId' || dbError.name === 'CastError') {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid concert ID format',
                    invalidId: true
                });
            }

            throw dbError;
        }

        if (!concert) {
            console.log(`❌ Concert ${concertId} not found in database`);
            return res.status(404).json({
                success: false,
                msg: 'Concert not found',
                concertId: concertId,
                notFound: true
            });
        }

        console.log(`✅ Found concert: ${concert.name}`);

        // Enhanced concert response
        const enhancedConcert = {
            ...concert.toObject(),
            // Add computed fields if needed
            id: concert._id,
            totalTickets: 0, // Will be computed if needed
            availableTickets: 0
        };

        res.json({
            success: true,
            concert: enhancedConcert,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error getting concert by ID:', error);

        // Enhanced error responses
        if (error.name === 'MongooseError' && error.message.includes('timeout')) {
            return res.status(408).json({
                success: false,
                msg: 'Database timeout - please try again',
                timeout: true
            });
        }

        if (error.kind === 'ObjectId' || error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                msg: 'Invalid concert ID format',
                invalidId: true
            });
        }

        res.status(500).json({
            success: false,
            msg: 'Server error getting concert',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// @route   POST /api/concerts
// @desc    Create a new concert
// @access  Private
router.post('/', auth, upload.single('posterImage'), concertController.createConcert);

// @route   PUT /api/concerts/:id/approve
// @desc    Approve concert
// @access  Private (Admin)
router.put('/:id/approve', auth, adminAuth, concertController.approveConcert);

// @route   PUT /api/concerts/:id/reject
// @desc    Reject concert
// @access  Private (Admin)
router.put('/:id/reject', auth, adminAuth, concertController.rejectConcert);

// @route   PUT /api/concerts/:id/request-info
// @desc    Request more info
// @access  Private (Admin)
router.put('/:id/request-info', auth, adminAuth, concertController.requestMoreInfo);

// @route   PUT /api/concerts/:id/additional-info
// @desc    Submit additional info
// @access  Private
router.put('/:id/additional-info', auth, concertController.submitAdditionalInfo);

// ENHANCED: Debug route for development (remove in production)
if (process.env.NODE_ENV !== 'production') {
    router.get('/debug/test-concert/:id', async (req, res) => {
        try {
            const concertId = req.params.id;
            const Concert = require('../models/Concert');

            console.log(`🔍 Debug: Testing concert ${concertId}`);

            // Check if concert exists
            const concert = await Concert.findById(concertId);

            res.json({
                success: true,
                debug: true,
                concertId: concertId,
                found: !!concert,
                concert: concert || null,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            res.json({
                success: false,
                debug: true,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });
}

// ENHANCED: Health check for routes
router.get('/ping', (req, res) => {
    res.json({
        success: true,
        msg: 'Concert routes are working',
        routes: [
            'GET /',
            'GET /:id',
            'GET /:concertId/minted-seats',
            'GET /pending',
            'GET /me/pending',
            'POST /',
            'PUT /:id/approve',
            'PUT /:id/reject'
        ],
        timestamp: new Date().toISOString()
    });
});

module.exports = router;