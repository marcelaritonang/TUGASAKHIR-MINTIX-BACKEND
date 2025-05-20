// backend/src/controllers/ticketController.js - ENHANCED FULL VERSION
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const Concert = require('../models/Concert');
const blockchainService = require('../services/blockchain');

// Enhanced Mint ticket with strict blockchain verification
/**
 * Mint a ticket - FIXED VERSION
 * @route   POST /api/tickets/mint
 */
exports.mintTicket = async (req, res) => {
    try {
        // Mulai pengukuran waktu
        const startTime = process.hrtime();
        const performanceSteps = [];

        // Fungsi untuk mencatat langkah performa
        const recordStep = (stepName) => {
            const stepTime = process.hrtime(startTime);
            const durationInMs = (stepTime[0] * 1000) + (stepTime[1] / 1000000);
            const durationInSec = durationInMs / 1000;

            performanceSteps.push({
                name: stepName,
                time: durationInSec, // dalam detik
                timestamp: Date.now()
            });

            console.log(`Performance: ${stepName} took ${durationInSec.toFixed(4)} seconds`);
            return durationInSec;
        };

        // Debug log semua input
        console.log('========== MINT TICKET REQUEST ==========');
        console.log('User: ', req.user ? req.user.walletAddress : 'Unknown');
        console.log('Body: ', JSON.stringify(req.body, null, 2));
        console.log('Headers Content-Type: ', req.headers['content-type']);
        console.log('=========================================');

        // Catat langkah pertama - inisialisasi
        recordStep('Init request');

        // STEP 1: Validasi input dasar
        if (!req.body.concertId) {
            return res.status(400).json({ success: false, msg: 'Concert ID is required' });
        }

        if (!req.body.sectionName) {
            return res.status(400).json({ success: false, msg: 'Section name is required' });
        }

        // Catat waktu validasi input
        recordStep('Input validation');

        // STEP 2: Validasi wallet address user
        const walletAddress = req.user?.walletAddress;
        if (!walletAddress) {
            return res.status(400).json({ success: false, msg: 'User wallet address not found' });
        }

        // STEP 3: Pengecekan transaction signature
        // Mode Development: Izinkan transaksi dummy
        const isDev = process.env.NODE_ENV !== 'production';
        let transactionSignature = req.body.transactionSignature;

        if (!transactionSignature) {
            if (isDev) {
                // Buat signature dummy untuk development
                transactionSignature = `dummy_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
                console.log('DEVELOPMENT MODE: Using dummy transaction signature:', transactionSignature);
            } else {
                return res.status(400).json({
                    success: false,
                    msg: 'Transaction signature is required'
                });
            }
        }

        console.log('Using transaction signature:', transactionSignature);

        // Catat waktu validasi signature
        recordStep('Signature validation');

        // STEP 4: Cari konser dan section
        const Concert = require('../models/Concert');
        const Ticket = require('../models/Ticket');

        // Catat waktu mulai akses database
        const dbStartTime = process.hrtime();

        const concert = await Concert.findById(req.body.concertId);

        // Catat waktu query konser
        recordStep('Concert database query');

        if (!concert) {
            return res.status(404).json({ success: false, msg: 'Concert not found' });
        }

        const section = concert.sections.find(s => s.name === req.body.sectionName);

        if (!section) {
            return res.status(400).json({ success: false, msg: 'Section not found in concert' });
        }

        if (section.availableSeats <= 0) {
            return res.status(400).json({ success: false, msg: 'No available seats in this section' });
        }

        // Catat waktu validasi section
        recordStep('Section validation');

        // STEP 5: Verifikasi seat number
        let seatNumber = req.body.seatNumber;

        if (!seatNumber) {
            // Auto-generate seat number jika tidak disediakan
            seatNumber = `${section.name}-${Math.floor(Math.random() * 10000)}`;
            console.log('Auto-generated seat number:', seatNumber);
        }

        // STEP 6: Periksa apakah kursi sudah terisi
        const existingTicket = await Ticket.findOne({
            concertId: req.body.concertId,
            sectionName: req.body.sectionName,
            seatNumber: seatNumber
        });

        // Catat waktu pengecekan tiket yang ada
        recordStep('Existing ticket check');

        if (existingTicket) {
            return res.status(400).json({ success: false, msg: 'This seat is already taken' });
        }

        // STEP 7: Verifikasi transaksi blockchain (optional)
        let verificationResult = null;

        if (transactionSignature && !transactionSignature.startsWith('dummy_')) {
            try {
                console.log('Verifying blockchain transaction...');
                const blockchainService = require('../services/blockchainService');

                // Catat waktu mulai verifikasi blockchain
                const bcStartTime = process.hrtime();

                if (typeof blockchainService.isTransactionValid === 'function') {
                    const isValid = await blockchainService.isTransactionValid(transactionSignature);
                    console.log('Transaction valid:', isValid);

                    // Hanya gagalkan di produksi jika transaksi tidak valid
                    if (!isValid && !isDev) {
                        return res.status(400).json({
                            success: false,
                            msg: 'Invalid blockchain transaction'
                        });
                    }

                    verificationResult = { valid: isValid };
                } else {
                    console.log('No transaction validation method available');
                }

                // Catat waktu verifikasi blockchain
                recordStep('Blockchain verification');
            } catch (verifyErr) {
                console.error('Error verifying transaction:', verifyErr);

                // Catat error verifikasi
                recordStep('Blockchain verification error');

                // Hanya gagalkan di produksi
                if (!isDev) {
                    return res.status(400).json({
                        success: false,
                        msg: 'Transaction verification failed: ' + verifyErr.message
                    });
                }
            }
        } else {
            // Catat langkah verifikasi dilewati
            recordStep('Blockchain verification skipped (dev mode)');
        }

        // STEP 8: Buat tiket baru
        const newTicket = new Ticket({
            concertId: req.body.concertId,
            sectionName: req.body.sectionName,
            seatNumber: seatNumber,
            price: section.price,
            owner: walletAddress,
            status: 'minted',
            transactionSignature: transactionSignature,

            // Simpan informasi penerima pembayaran
            paymentRecipient: req.body.receiverAddress || concert.creator,

            // Tambahkan riwayat transaksi
            transactionHistory: [{
                action: 'mint',
                from: 'system',
                to: walletAddress,
                timestamp: new Date(),
                transactionSignature: transactionSignature,
                price: section.price
            }]
        });

        // Catat waktu pembuatan objek tiket
        recordStep('Ticket object creation');

        // STEP 9: Simpan tiket
        const savedTicket = await newTicket.save();

        // Catat waktu penyimpanan tiket
        recordStep('Ticket database save');

        console.log(`Ticket created with ID: ${savedTicket._id}`);

        // STEP 10: Update jumlah kursi yang tersedia
        section.availableSeats -= 1;
        await concert.save();

        // Catat waktu update konser
        recordStep('Concert update');

        console.log(`Updated available seats for section ${section.name} to ${section.availableSeats}`);

        // STEP 11: Hitung total waktu dan persentase
        const endTime = process.hrtime(startTime);
        const totalDurationInMs = (endTime[0] * 1000) + (endTime[1] / 1000000);
        const totalDurationInSec = totalDurationInMs / 1000;

        console.log(`Total minting process took ${totalDurationInSec.toFixed(4)} seconds`);

        // Hitung persentase waktu untuk setiap langkah
        let totalStepTime = 0;
        performanceSteps.forEach(step => {
            totalStepTime += step.time;
        });

        performanceSteps.forEach(step => {
            step.percentage = (step.time / totalStepTime) * 100;
        });

        // Buat metrik performa final
        const performanceMetrics = {
            totalTime: totalDurationInSec,
            steps: performanceSteps,
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            nodeVersion: process.version
        };

        // STEP 12: Kirim respon dengan metrik performa
        return res.json({
            success: true,
            msg: 'Ticket minted successfully',
            ticket: {
                _id: savedTicket._id,
                concertId: savedTicket.concertId,
                sectionName: savedTicket.sectionName,
                seatNumber: savedTicket.seatNumber,
                price: savedTicket.price,
                owner: savedTicket.owner,
                transactionSignature: savedTicket.transactionSignature,
                createdAt: savedTicket.createdAt
            },
            verificationResult,
            // Hanya sertakan metrik performa jika diminta
            serverPerformance: req.body.includePerformanceMetrics ? performanceMetrics : null
        });
    } catch (error) {
        console.error('Error minting ticket:', error);
        return res.status(500).json({
            success: false,
            msg: 'Server error during mint process',
            error: error.message
        });
    }
};
// Enhanced Get my tickets
exports.getMyTickets = async (req, res) => {
    try {
        const walletAddress = req.user.walletAddress;
        const hideDeleted = req.query.hideDeleted === 'true';

        console.log('\n📋 ===== GET MY TICKETS =====');
        console.log('🔍 Wallet address:', walletAddress);
        console.log('🔍 Hide deleted concerts:', hideDeleted);

        if (!walletAddress) {
            console.log("❌ No wallet address provided");
            return res.status(400).json({
                success: false,
                error: 'Wallet address required'
            });
        }

        // Find all tickets owned by this wallet
        let tickets = await Ticket.find({
            owner: walletAddress
        }).sort({ createdAt: -1 });

        console.log(`📊 Found ${tickets.length} tickets for wallet ${walletAddress}`);

        // Ensure all tickets have transaction signatures
        for (const ticket of tickets) {
            if (!ticket.transactionSignature) {
                ticket.transactionSignature = `added_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
                await ticket.save();
                console.log(`✅ Added transaction signature to ticket ${ticket._id}`);
            }
        }

        // Filter tickets based on concert existence if requested
        if (hideDeleted) {
            const filteredTickets = [];
            for (const ticket of tickets) {
                try {
                    const concert = await Concert.findById(ticket.concertId);
                    if (concert) {
                        filteredTickets.push(ticket);
                    }
                } catch (error) {
                    console.error(`❌ Error checking concert for ticket ${ticket._id}:`, error);
                }
            }
            console.log(`📊 Returning ${filteredTickets.length} tickets after filtering deleted concerts`);
            return res.json(filteredTickets);
        }

        console.log(`📊 Returning ${tickets.length} total tickets`);
        res.json(tickets);
    } catch (err) {
        console.error('\n❌ Error in getMyTickets:', err);
        return res.status(500).json({
            success: false,
            error: 'Server error',
            message: err.message
        });
    }
};

// Enhanced Get ticket by ID
exports.getTicket = async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        // Check if concert exists
        try {
            const concert = await Concert.findById(ticket.concertId);
            if (!concert) {
                ticket.hasMissingConcert = true;
                await ticket.save();
            } else if (ticket.hasMissingConcert) {
                ticket.hasMissingConcert = false;
                await ticket.save();
            }
        } catch (err) {
            console.error(`Error finding concert for ticket ${ticket._id}:`, err);
            ticket.hasMissingConcert = true;
            await ticket.save();
        }

        // Ensure transaction signature exists
        if (!ticket.transactionSignature) {
            ticket.transactionSignature = `added_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
            await ticket.save();
        }

        res.json({
            success: true,
            ticket
        });
    } catch (err) {
        console.error('❌ Error in getTicket:', err);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found - invalid ID'
            });
        }
        res.status(500).json({
            success: false,
            msg: 'Server error',
            error: err.message
        });
    }
};

// Enhanced Verify ticket
exports.verifyTicket = async (req, res) => {
    try {
        console.log(`🔍 Verifying ticket: ${req.params.id} by user ${req.user.walletAddress}`);

        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        if (ticket.status === 'used') {
            return res.status(400).json({
                success: false,
                msg: 'Ticket already used'
            });
        }

        // Update ticket status
        ticket.status = 'used';
        ticket.isVerified = true;
        ticket.verifiedAt = new Date();

        // Add to transaction history
        ticket.transactionHistory.push({
            action: 'use',
            from: req.user.walletAddress,
            timestamp: new Date(),
            verificationAction: true
        });

        await ticket.save();
        console.log(`✅ Ticket ${req.params.id} marked as used`);

        res.json({
            success: true,
            msg: 'Ticket verified successfully',
            ticket
        });
    } catch (err) {
        console.error('❌ Error in verifyTicket:', err);
        res.status(500).json({
            success: false,
            msg: 'Server error',
            error: err.message
        });
    }
};

// Enhanced List ticket for sale
exports.listTicketForSale = async (req, res) => {
    try {
        // Debug logs
        console.log(`Listing ticket: ${req.params.id}`);
        console.log('Request body:', req.body);
        console.log('Content-Type:', req.headers['content-type']);

        const ticketId = req.params.id;

        // Pastikan ID tiket valid
        if (!ticketId) {
            return res.status(400).json({ success: false, msg: 'Ticket ID is required' });
        }

        // Pastikan body request valid
        if (!req.body || typeof req.body !== 'object') {
            return res.status(400).json({
                success: false,
                msg: 'Invalid request body'
            });
        }

        // Ekstrak price dari body request
        const { price } = req.body;

        // Validasi price
        if (price === undefined || price === null) {
            return res.status(400).json({
                success: false,
                msg: 'Price is required in request body'
            });
        }

        // Konversi price ke number
        const listingPrice = parseFloat(price);

        // Validasi price adalah angka positif
        if (isNaN(listingPrice) || listingPrice <= 0) {
            return res.status(400).json({
                success: false,
                msg: 'Price must be a positive number'
            });
        }

        // Cari tiket di database
        const Ticket = require('../models/Ticket');
        const ticket = await Ticket.findById(ticketId);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        // Verifikasi kepemilikan tiket
        if (ticket.owner !== req.user.walletAddress) {
            return res.status(403).json({
                success: false,
                msg: 'You are not the owner of this ticket'
            });
        }

        // Cek apakah tiket sudah dijual
        if (ticket.isListed) {
            return res.status(400).json({
                success: false,
                msg: 'Ticket is already listed for sale'
            });
        }

        // Update data tiket
        ticket.isListed = true;
        ticket.listingPrice = listingPrice;
        ticket.listingDate = new Date();

        // Tambahkan ke history transaksi
        ticket.transactionHistory.push({
            action: 'list_for_sale',
            from: ticket.owner,
            timestamp: new Date(),
            price: listingPrice
        });

        // Simpan perubahan
        await ticket.save();

        // Kirim respons sukses
        return res.json({
            success: true,
            msg: 'Ticket successfully listed for sale',
            ticket: {
                _id: ticket._id,
                isListed: ticket.isListed,
                listingPrice: ticket.listingPrice,
                listingDate: ticket.listingDate
            }
        });
    } catch (error) {
        console.error('Error listing ticket for sale:', error);
        return res.status(500).json({
            success: false,
            msg: 'Server error',
            error: error.message
        });
    }
};

// Enhanced Cancel ticket listing
exports.cancelTicketListing = async (req, res) => {
    try {
        const { id: ticketId } = req.params;

        console.log(`\n🚫 ===== CANCEL TICKET LISTING =====`);
        console.log(`🎫 Ticket ID: ${ticketId}`);
        console.log(`👤 User: ${req.user.walletAddress}`);

        // Find the ticket
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            console.log('❌ Ticket not found');
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        // Ensure user owns the ticket
        if (ticket.owner !== req.user.walletAddress) {
            console.log('❌ User not authorized');
            return res.status(401).json({
                success: false,
                msg: 'Not authorized - you are not the ticket owner'
            });
        }

        // Check if ticket is actually listed
        if (!ticket.isListed) {
            console.log('❌ Ticket not listed');
            return res.status(400).json({
                success: false,
                msg: 'Ticket is not currently listed for sale'
            });
        }

        // Store listing info before clearing
        const previousListingPrice = ticket.listingPrice;
        const previousListingDate = ticket.listingDate;

        // Update ticket, remove listing
        ticket.isListed = false;
        ticket.listingPrice = 0;
        ticket.listingDate = null;

        // Enhanced transaction history
        ticket.transactionHistory.push({
            action: 'cancel_listing',
            from: req.user.walletAddress,
            timestamp: new Date(),
            previousPrice: previousListingPrice,
            previousListingDate: previousListingDate,
            originalTransactionSignature: ticket.transactionSignature,
            marketplaceAction: true
        });

        await ticket.save();
        console.log('✅ Listing cancelled successfully');

        res.json({
            success: true,
            msg: 'Ticket listing cancelled successfully',
            ticket: {
                id: ticket._id,
                owner: ticket.owner,
                isListed: ticket.isListed,
                cancelledPrice: previousListingPrice,
                cancelledDate: new Date()
            }
        });
    } catch (err) {
        console.error('❌ Error cancelling ticket listing:', err);
        res.status(500).json({
            success: false,
            msg: 'Server error',
            error: err.message
        });
    }
};

// Enhanced Buy ticket from marketplace with full blockchain verification
exports.buyTicket = async (req, res) => {
    try {
        console.log('=========== BUY TICKET REQUEST ===========');
        console.log('Ticket ID:', req.params.id);
        console.log('Buyer wallet:', req.user?.walletAddress);
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        console.log('Headers Content-Type:', req.headers['content-type']);
        console.log('=========================================');

        const ticketId = req.params.id;
        const { transactionSignature } = req.body;

        // STEP 1: Validasi parameter
        if (!ticketId) {
            return res.status(400).json({
                success: false,
                msg: 'Ticket ID is required'
            });
        }

        if (!transactionSignature) {
            return res.status(400).json({
                success: false,
                msg: 'Transaction signature is required'
            });
        }

        // STEP 2: Validasi user (pembeli)
        if (!req.user || !req.user.walletAddress) {
            return res.status(401).json({
                success: false,
                msg: 'Authentication required to buy tickets'
            });
        }
        const buyerWallet = req.user.walletAddress;

        // STEP 3: Cari tiket di database
        const Ticket = require('../models/Ticket');
        const Concert = require('../models/Concert');

        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        // STEP 4: Verifikasi tiket tersedia untuk dijual
        if (!ticket.isListed) {
            return res.status(400).json({
                success: false,
                msg: 'This ticket is not listed for sale'
            });
        }

        // STEP 5: Verifikasi pembeli bukan penjual
        if (ticket.owner === buyerWallet) {
            return res.status(400).json({
                success: false,
                msg: 'You cannot buy your own ticket'
            });
        }

        // STEP 6: Simpan data penjual dan harga untuk histori
        const seller = ticket.owner;
        const originalPrice = ticket.price;
        const salePrice = ticket.listingPrice;

        console.log(`Seller: ${seller}, Buyer: ${buyerWallet}, Price: ${salePrice} SOL`);

        // STEP 7: Verifikasi transaksi blockchain (opsional)
        let verificationResult = null;
        try {
            // Cek jika blockchainService tersedia
            const blockchainService = require('../services/blockchainService');

            if (typeof blockchainService.verifyMarketplaceTransaction === 'function') {
                console.log('Verifying transaction with blockchain service...');

                // Verifikasi bahwa transaksi:
                // 1. Valid di blockchain
                // 2. Dikirim ke alamat penjual
                // 3. Dengan jumlah sesuai harga tiket
                verificationResult = await blockchainService.verifyMarketplaceTransaction(
                    transactionSignature,
                    seller,  // expected recipient
                    salePrice // expected amount
                );

                console.log('Transaction verification result:', verificationResult);

                // Jika verifikasi gagal, tolak pembelian (kecuali di mode development)
                if (verificationResult && !verificationResult.success && process.env.NODE_ENV === 'production') {
                    return res.status(400).json({
                        success: false,
                        msg: 'Transaction verification failed',
                        details: verificationResult
                    });
                }
            } else if (typeof blockchainService.verifyTransaction === 'function') {
                // Fallback ke fungsi verifikasi sederhana
                verificationResult = await blockchainService.verifyTransaction(
                    transactionSignature,
                    salePrice,
                    seller
                );

                // Hanya check di production
                if (!verificationResult.valid && process.env.NODE_ENV === 'production') {
                    return res.status(400).json({
                        success: false,
                        msg: 'Invalid transaction',
                        details: verificationResult
                    });
                }
            } else {
                console.log('No blockchain verification method available');
            }
        } catch (verifyErr) {
            console.error('Error verifying transaction:', verifyErr);
            // Skip verification error in development
            if (process.env.NODE_ENV === 'production') {
                return res.status(400).json({
                    success: false,
                    msg: 'Transaction verification error',
                    error: verifyErr.message
                });
            }
        }

        // STEP 8: Ambil data konser (untuk catatan)
        let concertName = 'Unknown Concert';
        let concertData = null;
        try {
            concertData = await Concert.findById(ticket.concertId);
            if (concertData) {
                concertName = concertData.name;
            }
        } catch (err) {
            console.warn('Could not fetch concert details:', err.message);
        }

        // STEP 9: Perbarui data ticket

        // A. Tambahkan ke riwayat pemilik sebelumnya
        if (!ticket.previousOwners) ticket.previousOwners = [];

        ticket.previousOwners.push({
            address: seller,
            fromDate: ticket.updatedAt || ticket.createdAt,
            toDate: new Date(),
            transactionSignature
        });

        // B. Perbarui kepemilikan
        const oldOwner = ticket.owner;
        ticket.owner = buyerWallet; // Set pembeli sebagai pemilik baru

        // C. Perbarui status tiket
        ticket.isListed = false; // Hapus dari marketplace
        ticket.listingPrice = 0;
        ticket.listingDate = null;
        ticket.isPrimary = false; // Tandai sebagai tiket secondary market
        ticket.paymentRecipient = seller; // Catat siapa yang menerima pembayaran

        // D. Tambahkan riwayat transaksi
        if (!ticket.transactionHistory) ticket.transactionHistory = [];

        ticket.transactionHistory.push({
            action: 'transfer',
            from: seller,
            to: buyerWallet,
            timestamp: new Date(),
            transactionSignature,
            price: salePrice
        });

        // E. Perbarui timestamp
        ticket.updatedAt = new Date();

        // STEP 10: Simpan perubahan
        const savedTicket = await ticket.save();
        console.log(`✅ Ticket ownership transferred from ${oldOwner} to ${buyerWallet}`);

        // STEP 11: PENTING - Buat dokumen baru di database jika perlu
        // Ini untuk mencegah tiket tetap muncul di akun penjual

        try {
            // Variasi 1: Hapus tiket dari listing marketplace global jika ada
            await Ticket.updateMany(
                { isListed: true, _id: { $ne: ticketId } },
                { $set: { needsRefresh: true } }
            );

            // Variasi 2: Perbarui semua cache terkait tiket
            // Tidak perlu implementasi DB, cukup memberi tahu klien untuk refresh

            // Variasi 3: Jika menggunakan duplikasi data di database, pastikan tiket dihapus dari daftar penjual
            // Jika ada koleksi MarketplaceListing terpisah
            try {
                const MarketplaceListing = require('../models/MarketplaceListing');
                await MarketplaceListing.deleteMany({ ticketId: ticketId });
                console.log(`Deleted marketplace listings for ticket ${ticketId}`);
            } catch (listingErr) {
                // Mungkin model tidak ada, abaikan
                console.log("MarketplaceListing model not found, skipping");
            }

            // Variasi 4: Jika ada collection UserTickets, perbarui kepemilikan di sana juga
            try {
                const UserTickets = require('../models/UserTickets');

                // Hapus dari penjual
                await UserTickets.deleteOne({ userWallet: seller, ticketId: ticketId });

                // Tambahkan ke pembeli
                await UserTickets.create({
                    userWallet: buyerWallet,
                    ticketId: ticketId,
                    addedAt: new Date()
                });

                console.log(`Updated UserTickets for ticket ${ticketId}`);
            } catch (userTicketsErr) {
                // Mungkin model tidak ada, abaikan
                console.log("UserTickets model not found, skipping");
            }

            console.log("Successfully processed additional ticket ownership updates");
        } catch (additionalUpdatesErr) {
            console.warn("Non-critical: Error during additional ticket updates:", additionalUpdatesErr);
            // Tidak gagalkan transaksi untuk kesalahan non-kritis
        }

        // STEP 12: Kirim respons sukses
        return res.json({
            success: true,
            msg: 'Ticket successfully purchased',
            verificationResult,
            ticket: {
                _id: savedTicket._id,
                concertId: savedTicket.concertId,
                concertName,
                sectionName: savedTicket.sectionName,
                seatNumber: savedTicket.seatNumber,
                price: originalPrice,
                salePrice,
                owner: savedTicket.owner,
                transactionSignature,
                // Tambahkan flag untuk memberi tahu klien untuk refresh data
                requiresDataRefresh: true
            }
        });
    } catch (error) {
        console.error('Error buying ticket:', error);
        return res.status(500).json({
            success: false,
            msg: 'Server error when processing ticket purchase',
            error: error.message
        });
    }
};


// Enhanced Delete ticket
exports.deleteTicket = async (req, res) => {
    try {
        const ticketId = req.params.id;
        console.log(`🗑️ Attempting to delete ticket ${ticketId} by user ${req.user.walletAddress}`);

        // Find ticket
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            console.log(`❌ Ticket ${ticketId} not found`);
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        // Validate ownership
        if (ticket.owner !== req.user.walletAddress) {
            console.log(`❌ Unauthorized: ${req.user.walletAddress} attempting to delete ticket owned by ${ticket.owner}`);
            return res.status(401).json({
                success: false,
                msg: 'Not authorized to delete this ticket'
            });
        }

        // Check if ticket is listed for sale
        if (ticket.isListed) {
            return res.status(400).json({
                success: false,
                msg: 'Cannot delete a ticket that is currently listed for sale. Please cancel the listing first.'
            });
        }

        // Enhanced blockchain cleanup logging
        if (ticket.transactionSignature &&
            !ticket.transactionSignature.startsWith('dummy_') &&
            !ticket.transactionSignature.startsWith('added_') &&
            !ticket.transactionSignature.startsWith('error_')) {

            console.log(`🔗 Deleting ticket with blockchain transaction: ${ticket.transactionSignature}`);
            console.log(`🔗 Transaction history:`, ticket.transactionHistory.length, 'entries');

            // Log if this was a resold ticket
            if (ticket.previousOwners && ticket.previousOwners.length > 0) {
                console.log(`🔗 Ticket had ${ticket.previousOwners.length} previous owners`);
            }
        }

        // Delete ticket from database
        const deleteResult = await Ticket.deleteOne({ _id: ticketId });
        if (deleteResult.deletedCount === 0) {
            console.log(`❌ Failed to delete ticket ${ticketId}`);
            return res.status(500).json({
                success: false,
                msg: 'Failed to delete ticket'
            });
        }

        console.log(`✅ Ticket ${ticketId} successfully deleted`);

        // Update concert available seats if applicable
        try {
            if (!ticket.hasMissingConcert) {
                const concert = await Concert.findById(ticket.concertId);
                if (concert) {
                    const section = concert.sections.find(s => s.name === ticket.sectionName);
                    if (section && ticket.status !== 'used') {
                        section.availableSeats = (section.availableSeats || 0) + 1;
                        concert.ticketsSold = Math.max(0, (concert.ticketsSold || 0) - 1);
                        await concert.save();
                        console.log(`✅ Updated concert ${concert._id} available seats for section ${ticket.sectionName}`);
                    }
                }
            }
        } catch (concertErr) {
            console.error(`⚠️ Error updating concert after ticket deletion: ${concertErr.message}`);
        }

        res.json({
            success: true,
            msg: 'Ticket deleted successfully'
        });
    } catch (err) {
        console.error('❌ Error in deleteTicket:', err);
        res.status(500).json({
            success: false,
            msg: 'Server error',
            error: err.message
        });
    }
};

// Get minted seats for a concert
exports.getMintedSeatsForConcert = async (req, res) => {
    try {
        console.log(`Getting minted seats for concert: ${req.params.concertId}`);

        // Basic validation
        if (!req.params.concertId) {
            return res.status(400).json({
                success: false,
                msg: 'Concert ID is required'
            });
        }

        // Normalize the concertId to avoid ObjectId casting issues
        const concertId = req.params.concertId.toString();
        console.log(`Normalized concertId: ${concertId}`);

        // Find tickets for this concert
        const Ticket = require('../models/Ticket');

        const tickets = await Ticket.find({
            concertId: concertId
        });

        console.log(`Found ${tickets.length} tickets for concert ${concertId}`);

        // Extract seat information
        const seats = tickets.map(ticket => {
            // Format: "SectionName-SeatNumber" or just seatNumber if it already contains section
            if (ticket.seatNumber && ticket.seatNumber.includes('-')) {
                return ticket.seatNumber;
            } else {
                return `${ticket.sectionName}-${ticket.seatNumber}`;
            }
        }).filter(Boolean); // Remove any undefined/null values

        // Cache this result
        // (Add caching if you have a cache service)

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
};
// Enhanced Get tickets for sale in marketplace
exports.getTicketsForSale = async (req, res) => {
    try {
        console.log('\n🛒 ===== MARKETPLACE API CALLED =====');
        console.log('👤 User:', req.user?.walletAddress || 'Anonymous');
        console.log('⏰ Time:', new Date().toISOString());

        //
        // Count total tickets first
        const totalTickets = await Ticket.countDocuments({});
        console.log('📊 Total tickets in database:', totalTickets);

        // Count listed tickets
        const listedCount = await Ticket.countDocuments({ isListed: true });
        console.log('📊 Listed tickets count:', listedCount);

        // Find all listed tickets (no user filtering since it's public)
        const query = { isListed: true };

        // Add concert filter if provided
        const { concertId } = req.query;
        if (concertId) {
            query.concertId = concertId;
            console.log('🔍 Added concert filter:', concertId);
        }

        console.log('🔍 Query:', JSON.stringify(query));

        // Find tickets
        const tickets = await Ticket.find(query).sort({ listingDate: -1 });
        console.log('📊 Raw tickets found:', tickets.length);

        // Log each ticket
        if (tickets.length > 0) {
            console.log('\n📋 LISTING ALL FOUND TICKETS:');
            tickets.forEach((ticket, i) => {
                console.log(`${i + 1}. ID: ${ticket._id}`);
                console.log(`   Owner: ${ticket.owner}`);
                console.log(`   Price: ${ticket.listingPrice} SOL`);
                console.log(`   Section: ${ticket.sectionName}`);
                console.log(`   Seat: ${ticket.seatNumber}`);
                console.log('   ──────────────────');
            });
        } else {
            console.log('❌ NO TICKETS FOUND!');
        }

        // Process each ticket and add concert info
        const ticketsWithConcertInfo = [];

        for (const ticket of tickets) {
            try {
                const concert = await Concert.findById(ticket.concertId);

                ticketsWithConcertInfo.push({
                    ...ticket.toObject(),
                    concertName: concert ? concert.name : 'Unknown Concert',
                    concertVenue: concert ? concert.venue : 'Unknown Venue',
                    concertDate: concert ? concert.date : null,
                    concertExists: !!concert
                });

            } catch (concertError) {
                console.error(`❌ Error fetching concert for ticket ${ticket._id}:`, concertError);

                ticketsWithConcertInfo.push({
                    ...ticket.toObject(),
                    concertName: 'Unknown Concert',
                    concertVenue: 'Unknown Venue',
                    concertDate: null,
                    concertExists: false
                });
            }
        }

        console.log(`\n✅ FINAL RESULT: Returning ${ticketsWithConcertInfo.length} tickets`);
        console.log('🛒 ===== MARKETPLACE API END =====\n');

        res.status(200).json({
            success: true,
            tickets: ticketsWithConcertInfo,
            count: ticketsWithConcertInfo.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('\n❌ ERROR in getTicketsForSale:', error);

        // Enhanced error categorization
        let errorMessage = 'Server error in marketplace';
        let statusCode = 500;

        if (error.name === 'CastError') {
            errorMessage = 'Invalid ticket or concert ID format';
            statusCode = 400;
        } else if (error.name === 'ValidationError') {
            errorMessage = 'Data validation error';
            statusCode = 400;
        } else if (error.message.includes('timeout')) {
            errorMessage = 'Database timeout - please try again';
            statusCode = 408;
        } else if (error.message.includes('connection')) {
            errorMessage = 'Database connection error';
            statusCode = 503;
        }

        res.status(statusCode).json({
            success: false,
            msg: errorMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    }
};

// Enhanced Fix missing transaction for a ticket
exports.fixMissingTransaction = async (req, res) => {
    try {
        const ticketId = req.params.id;
        const { transactionSignature } = req.body;

        console.log(`🔧 ===== FIX MISSING TRANSACTION =====`);
        console.log(`🎫 Ticket ID: ${ticketId}`);
        console.log(`💳 New signature: ${transactionSignature}`);

        // Find the ticket
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        // Check if user owns the ticket
        if (ticket.owner !== req.user.walletAddress) {
            return res.status(401).json({
                success: false,
                msg: 'Not authorized to modify this ticket'
            });
        }

        // Validate new transaction signature format
        if (!transactionSignature || transactionSignature.length < 64) {
            return res.status(400).json({
                success: false,
                msg: 'Invalid transaction signature format'
            });
        }

        console.log(`Updating ticket ${ticketId} with transaction signature: ${transactionSignature}`);

        // Replace old signature with new one
        const oldSignature = ticket.transactionSignature;
        ticket.transactionSignature = transactionSignature;

        // Add log to transaction history
        if (!ticket.transactionHistory) {
            ticket.transactionHistory = [];
        }

        ticket.transactionHistory.push({
            action: 'update_transaction',
            from: req.user.walletAddress,
            timestamp: new Date(),
            transactionSignature: transactionSignature,
            oldSignature: oldSignature,
            fixAction: true
        });

        // Save changes
        await ticket.save();
        console.log(`✅ Transaction signature updated for ticket ${ticketId}`);

        // Verify transaction on blockchain if not dummy
        let blockchainVerified = false;
        let verificationDetails = null;

        if (transactionSignature &&
            !transactionSignature.startsWith('dummy_') &&
            !transactionSignature.startsWith('added_') &&
            !transactionSignature.startsWith('error_')) {

            try {
                const isValid = await blockchainService.isTransactionValid(transactionSignature);
                blockchainVerified = isValid;

                if (isValid) {
                    // Get detailed verification if valid
                    verificationDetails = await blockchainService.getTransactionDetails(transactionSignature);
                }

                console.log(`🔍 Blockchain verification for ${transactionSignature}: ${blockchainVerified ? 'Success' : 'Failed'}`);
            } catch (verifyErr) {
                console.warn(`⚠️ Could not verify transaction ${transactionSignature} on blockchain:`, verifyErr);
            }
        }

        res.json({
            success: true,
            msg: 'Transaction signature updated successfully',
            ticket: {
                id: ticket._id,
                owner: ticket.owner,
                oldSignature: oldSignature,
                newSignature: transactionSignature,
                blockchainVerified: blockchainVerified,
                verificationDetails: verificationDetails
            }
        });
    } catch (err) {
        console.error('❌ Error in fixMissingTransaction:', err);
        res.status(500).json({
            success: false,
            msg: 'Server error',
            error: err.message
        });
    }
};

// Enhanced Mark ticket as valid despite missing concert
exports.markTicketValid = async (req, res) => {
    try {
        const ticketId = req.params.id;

        console.log(`✅ ===== MARK TICKET VALID =====`);
        console.log(`🎫 Ticket ID: ${ticketId}`);
        console.log(`👤 User: ${req.user.walletAddress}`);

        // Find the ticket
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        // Check if user owns the ticket
        if (ticket.owner !== req.user.walletAddress) {
            return res.status(401).json({
                success: false,
                msg: 'Not authorized to modify this ticket'
            });
        }

        // Set hasMissingConcert flag to true
        ticket.hasMissingConcert = true;

        // Add to transaction history
        ticket.transactionHistory.push({
            action: 'mark_valid',
            from: req.user.walletAddress,
            timestamp: new Date(),
            notes: 'Ticket marked as valid despite missing concert',
            adminAction: true
        });

        await ticket.save();
        console.log(`✅ Ticket ${ticketId} marked as valid despite missing concert`);

        res.json({
            success: true,
            msg: 'Ticket marked as valid successfully',
            ticket: {
                id: ticket._id,
                owner: ticket.owner,
                hasMissingConcert: ticket.hasMissingConcert,
                markedAt: new Date()
            }
        });
    } catch (err) {
        console.error('❌ Error in markTicketValid:', err);
        res.status(500).json({
            success: false,
            msg: 'Server error',
            error: err.message
        });
    }
};

// NEW: Calculate royalty for resale
exports.calculateRoyalty = async (req, res) => {
    try {
        const { ticketId, royaltyPercentage = 5 } = req.body; // Default 5% royalty

        console.log(`💰 ===== CALCULATE ROYALTY =====`);
        console.log(`🎫 Ticket ID: ${ticketId}`);
        console.log(`💎 Royalty %: ${royaltyPercentage}%`);

        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        const concert = await Concert.findById(ticket.concertId);
        if (!concert) {
            return res.status(404).json({
                success: false,
                msg: 'Concert not found'
            });
        }

        // Calculate royalty
        const salePrice = ticket.listingPrice || ticket.price;
        const royaltyAmount = (salePrice * royaltyPercentage) / 100;
        const sellerAmount = salePrice - royaltyAmount;
        const marketplaceFee = (salePrice * 2.5) / 100; // 2.5% marketplace fee
        const finalSellerAmount = sellerAmount - marketplaceFee;

        console.log(`✅ Royalty calculated: ${royaltyAmount} SOL to creator, ${finalSellerAmount} SOL to seller`);

        res.json({
            success: true,
            royaltyCalculation: {
                ticketId: ticketId,
                salePrice: salePrice,
                royaltyPercentage: royaltyPercentage,
                royaltyAmount: royaltyAmount,
                marketplaceFee: marketplaceFee,
                sellerAmount: finalSellerAmount,
                creator: concert.creator,
                seller: ticket.owner,
                breakdown: {
                    gross: salePrice,
                    royalty: `-${royaltyAmount}`,
                    marketplaceFee: `-${marketplaceFee}`,
                    net: finalSellerAmount
                }
            }
        });
    } catch (err) {
        console.error('❌ Error calculating royalty:', err);
        res.status(500).json({
            success: false,
            msg: 'Server error',
            error: err.message
        });
    }
};

// NEW: Get ticket transaction history
exports.getTicketTransactionHistory = async (req, res) => {
    try {
        const { id: ticketId } = req.params;

        console.log(`📜 ===== GET TRANSACTION HISTORY =====`);
        console.log(`🎫 Ticket ID: ${ticketId}`);
        console.log(`👤 User: ${req.user.walletAddress}`);

        const ticket = await Ticket.findById(ticketId)
            .populate('concertId', 'name venue creator date');

        if (!ticket) {
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        // Check if user owns ticket or is admin (if admin system exists)
        if (ticket.owner !== req.user.walletAddress && !req.user.isAdmin) {
            return res.status(401).json({
                success: false,
                msg: 'Not authorized to view this ticket history'
            });
        }

        // Calculate total value transferred in history
        const totalTransferred = ticket.transactionHistory
            .filter(tx => tx.price && tx.action === 'transfer')
            .reduce((sum, tx) => sum + tx.price, 0);

        console.log(`✅ Retrieved transaction history: ${ticket.transactionHistory.length} entries`);

        res.json({
            success: true,
            ticket: {
                id: ticket._id,
                currentOwner: ticket.owner,
                currentStatus: ticket.status,
                isListed: ticket.isListed,
                listingPrice: ticket.listingPrice,
                concertInfo: ticket.concertId,
                transactionHistory: ticket.transactionHistory.map(tx => ({
                    ...tx.toObject(),
                    formattedDate: new Date(tx.timestamp).toLocaleString()
                })),
                previousOwners: ticket.previousOwners,
                stats: {
                    totalTransactions: ticket.transactionHistory.length,
                    totalTransferred: totalTransferred,
                    timesSold: ticket.previousOwners ? ticket.previousOwners.length : 0,
                    createdAt: ticket.createdAt,
                    lastActivity: ticket.updatedAt
                }
            }
        });
    } catch (err) {
        console.error('❌ Error getting transaction history:', err);
        res.status(500).json({
            success: false,
            msg: 'Server error',
            error: err.message
        });
    }
};

// NEW: Get marketplace statistics
exports.getMarketplaceStats = async (req, res) => {
    try {
        console.log(`📊 ===== GET MARKETPLACE STATS =====`);

        // Aggregate statistics
        const totalTickets = await Ticket.countDocuments({});
        const listedTickets = await Ticket.countDocuments({ isListed: true });
        const soldTickets = await Ticket.countDocuments({
            transactionHistory: {
                $elemMatch: { action: 'transfer' }
            }
        });

        // Calculate average listing price
        const avgPriceResult = await Ticket.aggregate([
            { $match: { isListed: true } },
            { $group: { _id: null, avgPrice: { $avg: '$listingPrice' } } }
        ]);

        const avgListingPrice = avgPriceResult.length > 0 ? avgPriceResult[0].avgPrice : 0;

        // Get price range
        const priceRangeResult = await Ticket.aggregate([
            { $match: { isListed: true } },
            {
                $group: {
                    _id: null,
                    minPrice: { $min: '$listingPrice' },
                    maxPrice: { $max: '$listingPrice' }
                }
            }
        ]);

        const priceRange = priceRangeResult.length > 0 ? priceRangeResult[0] : { minPrice: 0, maxPrice: 0 };

        // Recent activity (last 24 hours)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentActivity = await Ticket.countDocuments({
            $or: [
                { listingDate: { $gte: oneDayAgo } },
                { updatedAt: { $gte: oneDayAgo } }
            ]
        });

        console.log(`✅ Marketplace stats calculated`);

        res.json({
            success: true,
            marketplaceStats: {
                totalTickets: totalTickets,
                listedTickets: listedTickets,
                soldTickets: soldTickets,
                availableRate: totalTickets > 0 ? (listedTickets / totalTickets * 100).toFixed(2) : 0,
                avgListingPrice: parseFloat(avgListingPrice.toFixed(4)),
                priceRange: {
                    min: priceRange.minPrice || 0,
                    max: priceRange.maxPrice || 0
                },
                recentActivity: recentActivity,
                generatedAt: new Date().toISOString()
            }
        });
    } catch (err) {
        console.error('❌ Error getting marketplace stats:', err);
        res.status(500).json({
            success: false,
            msg: 'Server error',
            error: err.message
        });
    }
};

module.exports = {
    mintTicket: exports.mintTicket,
    getMyTickets: exports.getMyTickets,
    getTicket: exports.getTicket,
    verifyTicket: exports.verifyTicket,
    listTicketForSale: exports.listTicketForSale,
    cancelTicketListing: exports.cancelTicketListing,
    buyTicket: exports.buyTicket,
    deleteTicket: exports.deleteTicket,
    getMintedSeatsForConcert: exports.getMintedSeatsForConcert,
    getTicketsForSale: exports.getTicketsForSale,
    fixMissingTransaction: exports.fixMissingTransaction,
    markTicketValid: exports.markTicketValid,
    calculateRoyalty: exports.calculateRoyalty,
    getTicketTransactionHistory: exports.getTicketTransactionHistory,
    getMarketplaceStats: exports.getMarketplaceStats
};