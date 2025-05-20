const mongoose = require('mongoose');
const Concert = require('../models/Concert');
const blockchainService = require('../services/blockchain');

// Get all approved concerts
exports.getConcerts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const concerts = await Concert.find({ status: 'approved' })
            .sort({ date: 1 })
            .skip(skip)
            .limit(limit);

        const total = await Concert.countDocuments({ status: 'approved' });

        res.json({
            concerts,
            pagination: {
                total,
                page,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// Get single concert
exports.getConcert = async (req, res) => {
    try {
        const concert = await Concert.findById(req.params.id);

        if (!concert) {
            return res.status(404).json({ msg: 'Concert not found' });
        }

        // Public can only view approved concerts
        if (concert.status !== 'approved' &&
            (!req.user || concert.creator !== req.user.walletAddress)) {
            return res.status(404).json({ msg: 'Concert not found' });
        }

        res.json(concert);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Concert not found' });
        }
        res.status(500).send('Server error');
    }
};

// Create a concert
// Perbaiki di controllers/concertController.js
exports.createConcert = async (req, res) => {
    try {
        console.log("Request body untuk create concert:", req.body);
        console.log("File yang diupload:", req.file);

        const {
            name,
            venue,
            date,
            description,
            category,
            sections,
            totalTickets
        } = req.body;

        // Pastikan user ada dalam request
        if (!req.user || !req.user.walletAddress) {
            return res.status(401).json({ msg: 'User authentication required' });
        }

        // Parse sections jika dikirim sebagai string
        let parsedSections = sections;
        if (typeof sections === 'string') {
            try {
                parsedSections = JSON.parse(sections);
            } catch (e) {
                console.error("Error parsing sections:", e);
                return res.status(400).json({ msg: 'Invalid sections format' });
            }
        }

        // Create concert in database first
        const newConcert = new Concert({
            name,
            venue,
            date,
            description,
            category,
            creator: req.user.walletAddress,
            sections: parsedSections,
            totalTickets,
            ticketsSold: 0,
            status: 'pending' // All concerts start as pending
        });

        // Save poster URL if uploaded
        if (req.file) {
            // In a real app, upload to S3/Cloudinary and save URL
            newConcert.posterUrl = `/uploads/${req.file.filename}`;
        }

        // Log sebelum menyimpan
        console.log("Membuat concert baru:", {
            name: newConcert.name,
            venue: newConcert.venue,
            status: newConcert.status
        });

        // Save to database
        const concert = await newConcert.save();

        // Log ID untuk memastikan
        console.log("Concert berhasil dibuat dengan ID:", concert._id.toString());
        console.log("Status concert:", concert.status);

        // Langsung coba cari kembali untuk memastikan tersimpan dengan benar
        const savedConcert = await Concert.findById(concert._id);
        if (savedConcert) {
            console.log("Concert ditemukan kembali setelah save:", savedConcert.name);
        } else {
            console.log("WARNING: Concert tidak ditemukan setelah save!");
        }

        // Untuk memastikan, log semua konser yang pending
        const pendingConcerts = await Concert.find({ status: 'pending' });
        console.log(`Total konser pending setelah save: ${pendingConcerts.length}`);

        // Pastikan untuk mengembalikan data konser yang berhasil dibuat
        res.json(concert);
    } catch (err) {
        console.error("Error creating concert:", err.message);
        res.status(500).send('Server error');
    }
};

// Admin: Get pending concerts
exports.getPendingConcerts = async (req, res) => {
    try {
        console.log("Admin mengakses daftar konser pending");

        // Gunakan $in untuk mencocokkan status 'pending' dan 'info_requested'
        const concerts = await Concert.find({
            status: { $in: ['pending', 'info_requested'] }
        }).sort({ createdAt: -1 });

        console.log(`Ditemukan ${concerts.length} konser pending`);

        // Log daftar konser yang ditemukan untuk debugging
        if (concerts.length > 0) {
            concerts.forEach((concert, index) => {
                console.log(`${index + 1}. ${concert.name} (ID: ${concert._id.toString()})`);
            });
        } else {
            console.log("Tidak ada konser pending yang ditemukan");
        }

        res.json(concerts);
    } catch (err) {
        console.error("Error saat mengambil konser pending:", err.message);
        res.status(500).send('Server error');
    }
};
// Admin: Approve concert
// Perbaiki di controllers/concertController.js
exports.approveConcert = async (req, res) => {
    try {
        console.log(`Request untuk approve concert dengan ID: ${req.params.id}`);
        console.log("Tipe data ID:", typeof req.params.id);
        console.log("Panjang ID:", req.params.id.length);

        // Periksa apakah ID memiliki format yang valid
        const id = req.params.id;
        if (!id || (id.length !== 24 && !mongoose.Types.ObjectId.isValid(id))) {
            console.log("ID tidak valid:", id);
            return res.status(400).json({ msg: 'Format ID konser tidak valid', providedId: id });
        }

        // Coba cari dengan exact match terlebih dahulu
        let concert = await Concert.findById(id);

        // Jika tidak ditemukan, coba cari konser yang ID-nya diawali dengan string yang diberikan
        if (!concert && id.length < 24) {
            console.log(`ID ${id} tidak ditemukan, mencoba pencarian dengan awalan...`);
            const regex = new RegExp(`^${id}`);
            const concerts = await Concert.find({ _id: { $regex: regex } });

            if (concerts.length === 1) {
                // Jika ditemukan tepat satu konser, gunakan itu
                concert = concerts[0];
                console.log(`Menemukan satu konser dengan ID yang dimulai dengan ${id}: ${concert._id}`);
            } else if (concerts.length > 1) {
                // Jika ditemukan lebih dari satu, kembalikan error
                console.log(`Ditemukan ${concerts.length} konser dengan ID yang dimulai dengan ${id}`);
                return res.status(400).json({
                    msg: 'ID tidak spesifik, ditemukan beberapa konser',
                    matches: concerts.map(c => ({ id: c._id, name: c.name }))
                });
            }
        }

        if (!concert) {
            console.log("Konser tidak ditemukan dengan ID:", id);
            return res.status(404).json({ msg: 'Concert not found' });
        }

        console.log("Konser ditemukan:", concert.name);

        // Ubah status
        concert.status = 'approved';

        // Pastikan array approvalHistory ada
        if (!concert.approvalHistory) {
            concert.approvalHistory = [];
        }

        // Tambahkan ke riwayat approval
        concert.approvalHistory.push({
            action: 'approve',
            admin: req.user.walletAddress,
            message: req.body.feedback || 'Approved',
            timestamp: Date.now()
        });

        // Simpan ke database
        await concert.save();
        console.log("Konser berhasil disetujui");

        res.json(concert);
    } catch (err) {
        console.error("Error saat menyetujui konser:", err);
        res.status(500).json({ msg: 'Server error', error: err.message, stack: err.stack });
    }
};

// Lanjutkan dengan metode-metode lainnya...

// Admin: Reject concert
exports.rejectConcert = async (req, res) => {
    try {
        const concert = await Concert.findById(req.params.id);

        if (!concert) {
            return res.status(404).json({ msg: 'Concert not found' });
        }

        // Change status
        concert.status = 'rejected';

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
        res.status(500).send('Server error');
    }
};

// Admin: Request more info
exports.requestMoreInfo = async (req, res) => {
    try {
        const concert = await Concert.findById(req.params.id);

        if (!concert) {
            return res.status(404).json({ msg: 'Concert not found' });
        }

        // Change status
        concert.status = 'info_requested';

        // Add to approval history
        concert.approvalHistory.push({
            action: 'request_info',
            admin: req.user.walletAddress,
            message: req.body.message,
            timestamp: Date.now()
        });

        // Save to database
        await concert.save();

        res.json(concert);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// User: Get my pending concerts
exports.getMyPendingConcerts = async (req, res) => {
    try {
        const concerts = await Concert.find({
            creator: req.user.walletAddress,
            status: { $in: ['pending', 'info_requested'] }
        }).sort({ createdAt: -1 });

        res.json(concerts);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// User: Submit additional info
exports.submitAdditionalInfo = async (req, res) => {
    try {
        const concert = await Concert.findById(req.params.id);

        if (!concert) {
            return res.status(404).json({ msg: 'Concert not found' });
        }

        // Verify ownership
        if (concert.creator !== req.user.walletAddress) {
            return res.status(401).json({ msg: 'Unauthorized' });
        }

        // Update additional info
        concert.additionalInfo = req.body.additionalInfo;
        concert.status = 'pending'; // Change back to pending

        // Save to database
        await concert.save();

        res.json(concert);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// User: Get my concerts by status (pending, approved, rejected, info_requested)
exports.getMyConcertsByStatus = async (req, res) => {
    try {
        const { status } = req.params;

        // Validate status
        const validStatuses = ['pending', 'approved', 'rejected', 'info_requested'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ msg: 'Invalid status' });
        }

        const concerts = await Concert.find({
            creator: req.user.walletAddress,
            status: status
        }).sort({ createdAt: -1 });

        res.json(concerts);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// Admin: Get approved concerts
exports.getApprovedConcerts = async (req, res) => {
    try {
        const concerts = await Concert.find({ status: 'approved' })
            .sort({ updatedAt: -1 });

        console.log("Found approved concerts:", concerts.length);
        res.json(concerts);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// Admin: Get rejected concerts
exports.getRejectedConcerts = async (req, res) => {
    try {
        const concerts = await Concert.find({ status: 'rejected' })
            .sort({ updatedAt: -1 });

        console.log("Found rejected concerts:", concerts.length);
        res.json(concerts);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

// Admin: Get concert statistics
exports.getConcertStats = async (req, res) => {
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
        res.status(500).send('Server error');
    }
};
