//routes/admin.js

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Concert = require('../models/Concert');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// @route   GET /api/admin/concerts/pending
// @desc    Get all pending concerts
// @access  Private (Admin)
router.get('/concerts/pending', auth, adminAuth, async (req, res) => {
    try {
        const concerts = await Concert.find({ status: 'pending' })
            .sort({ createdAt: -1 });

        console.log("Pending concerts:", concerts.length);
        res.json(concerts);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// @route   GET /api/admin/concerts/approved
// @desc    Get all approved concerts
// @access  Private (Admin)
router.get('/concerts/approved', auth, adminAuth, async (req, res) => {
    try {
        const concerts = await Concert.find({ status: 'approved' })
            .sort({ updatedAt: -1 });

        console.log("Approved concerts:", concerts.length);
        res.json(concerts);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// @route   GET /api/admin/concerts/rejected
// @desc    Get all rejected concerts
// @access  Private (Admin)
router.get('/concerts/rejected', auth, adminAuth, async (req, res) => {
    try {
        const concerts = await Concert.find({ status: 'rejected' })
            .sort({ updatedAt: -1 });

        console.log("Rejected concerts:", concerts.length);
        res.json(concerts);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// @route   PUT /api/admin/concerts/:id/approve
// @desc    Approve a concert
// @access  Private (Admin)
router.put('/concerts/:id/approve', auth, adminAuth, async (req, res) => {
    try {
        console.log(`Request to approve concert ${req.params.id} from admin ${req.user.walletAddress}`);

        // Check if ID is valid
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            console.log("Invalid ObjectId format:", req.params.id);
            return res.status(400).json({ msg: 'Invalid concert ID format' });
        }

        const concert = await Concert.findById(req.params.id);

        if (!concert) {
            console.log("Concert not found:", req.params.id);
            return res.status(404).json({ msg: 'Concert not found' });
        }

        console.log("Concert found:", concert.name);

        // Change status
        concert.status = 'approved';

        // Ensure approvalHistory array exists
        if (!concert.approvalHistory) {
            concert.approvalHistory = [];
        }

        // Add to approval history
        concert.approvalHistory.push({
            action: 'approve',
            admin: req.user.walletAddress,
            message: req.body.feedback || 'Approved',
            timestamp: Date.now()
        });

        // Save to database
        await concert.save();
        console.log("Concert successfully approved");

        res.json(concert);
    } catch (err) {
        console.error("Error in approveConcert:", err);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
});

// @route   PUT /api/admin/concerts/:id/reject
// @desc    Reject a concert
// @access  Private (Admin)
router.put('/concerts/:id/reject', auth, adminAuth, async (req, res) => {
    try {
        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid concert ID format' });
        }

        const concert = await Concert.findById(req.params.id);

        if (!concert) {
            return res.status(404).json({ msg: 'Concert not found' });
        }

        // Change status
        concert.status = 'rejected';

        // Ensure approvalHistory array exists
        if (!concert.approvalHistory) {
            concert.approvalHistory = [];
        }

        // Add to approval history
        concert.approvalHistory.push({
            action: 'reject',
            admin: req.user.walletAddress,
            message: req.body.feedback || 'Rejected',
            timestamp: Date.now()
        });

        // Save to database
        await concert.save();

        res.json(concert);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

// @route   DELETE /api/admin/concerts/:id
// @desc    Delete a concert
// @access  Private (Admin)
router.delete('/concerts/:id', auth, adminAuth, async (req, res) => {
    try {
        console.log(`Starting delete process for concert: ${req.params.id}`);
        console.log(`Admin: ${req.user.walletAddress}`);

        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            console.log("Invalid ObjectId format:", req.params.id);
            return res.status(400).json({ msg: 'Invalid concert ID format' });
        }

        const concert = await Concert.findById(req.params.id);

        if (!concert) {
            console.log("Concert not found:", req.params.id);
            return res.status(404).json({ msg: 'Concert not found' });
        }

        console.log(`Found concert: ${concert.name}`);

        // Delete the concert from database
        await Concert.findByIdAndDelete(req.params.id);
        console.log("Concert deleted successfully");

        // Return success response
        return res.json({
            success: true,
            msg: 'Concert deleted successfully',
            deletedConcert: {
                id: req.params.id,
                name: concert.name
            }
        });
    } catch (err) {
        console.error('Error deleting concert:', err.message);
        // Return error in JSON format
        return res.status(500).json({ msg: 'Server error', error: err.message });
    }
});

// @route   GET /api/admin/concerts/stats
// @desc    Get concert statistics
// @access  Private (Admin)
router.get('/concerts/stats', auth, adminAuth, async (req, res) => {
    try {
        const pending = await Concert.countDocuments({ status: 'pending' });
        const infoRequested = await Concert.countDocuments({ status: 'info_requested' });
        const approved = await Concert.countDocuments({ status: 'approved' });
        const rejected = await Concert.countDocuments({ status: 'rejected' });

        res.json({
            pending,
            infoRequested,
            approved,
            rejected,
            total: pending + infoRequested + approved + rejected
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;