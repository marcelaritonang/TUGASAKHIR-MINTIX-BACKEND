//routes/concerts.js
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

// @route   GET /api/concerts/:id
// @desc    Get concert by ID
// @access  Public/Private (depends on status)
router.get('/:id', concertController.getConcert);

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

module.exports = router;