// controllers/ticketController.js
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const Concert = require('../models/Concert');
const blockchainService = require('../services/blockchain');

// Mint ticket
exports.mintTicket = async (req, res) => {
    try {
        const { concertId, sectionName, quantity = 1, seatNumber } = req.body;

        console.log("Mint ticket request:", { concertId, sectionName, quantity, seatNumber, user: req.user.walletAddress });

        // Find concert
        const concert = await Concert.findById(concertId);

        if (!concert) {
            return res.status(404).json({ msg: 'Concert not found' });
        }

        if (concert.status !== 'approved') {
            return res.status(400).json({ msg: 'Concert is not approved yet' });
        }

        // Find section
        const section = concert.sections.find(s => s.name === sectionName);

        if (!section) {
            return res.status(404).json({ msg: 'Section not found' });
        }

        // Check if tickets available
        if (section.availableSeats < quantity) {
            return res.status(400).json({ msg: 'Not enough tickets available' });
        }

        // Check if seat already taken if seat number is provided
        if (seatNumber) {
            const existingTicket = await Ticket.findOne({
                concertId: concert._id,
                seatNumber: seatNumber
            });

            if (existingTicket) {
                return res.status(400).json({ msg: 'This seat is already taken' });
            }
        }

        // Update available seats
        section.availableSeats -= quantity;
        concert.ticketsSold += quantity;

        console.log(`Updating concert: ${quantity} tickets sold, ${section.availableSeats} seats remaining in ${sectionName}`);

        await concert.save();

        // Create tickets in database
        const tickets = [];

        for (let i = 0; i < quantity; i++) {
            // Generate seat number if not provided
            let ticketSeatNumber = seatNumber;

            if (!ticketSeatNumber) {
                ticketSeatNumber = `${sectionName}-${section.totalSeats - section.availableSeats + i}`;
            }

            const newTicket = new Ticket({
                concertId: concert._id,
                sectionName,
                price: section.price,
                owner: req.user.walletAddress,
                seatNumber: ticketSeatNumber,
                status: 'minted'
            });

            // Add transaction history
            newTicket.transactionHistory.push({
                action: 'mint',
                from: req.user.walletAddress,
                timestamp: Date.now()
            });

            await newTicket.save();
            console.log(`Ticket created: ${newTicket._id} - ${ticketSeatNumber}`);

            tickets.push(newTicket);

            // If blockchain integration is enabled, mint on blockchain too
            try {
                if (blockchainService.isEnabled) {
                    const blockchainResult = await blockchainService.createTicket(
                        req.user.walletAddress,
                        concert._id.toString(),
                        sectionName,
                        ticketSeatNumber
                    );

                    if (blockchainResult && blockchainResult.mintAddress) {
                        // Update ticket with blockchain info
                        newTicket.mintAddress = blockchainResult.mintAddress;
                        newTicket.mintSignature = blockchainResult.tx;
                        await newTicket.save();
                        console.log(`Blockchain mint successful: ${blockchainResult.mintAddress}`);
                    }
                }
            } catch (blockchainError) {
                console.error('Blockchain minting error:', blockchainError);
                // We continue even if blockchain minting failed - the ticket is still valid in our database
            }
        }

        res.json({
            success: true,
            tickets
        });
    } catch (err) {
        console.error('Error in mintTicket:', err);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// Get my tickets
// Perbaikan di controller untuk memastikan response yang benar
exports.getMyTickets = async (req, res) => {
    try {
        const walletAddress = req.user.walletAddress;
        console.log(`Getting tickets for user wallet: ${walletAddress}`);

        if (!walletAddress) {
            console.log("Tidak ada alamat wallet dalam permintaan");
            return res.status(400).json({ error: 'Wallet address required' });
        }

        // Tambahkan logging untuk membantu debug
        console.log('Mencari tiket dengan wallet address:', walletAddress);

        const tickets = await Ticket.find({
            owner: walletAddress
        }).populate('concertId');

        console.log(`Found ${tickets.length} tickets for wallet ${walletAddress}`);

        // Pastikan response valid
        return res.json(tickets || []);
    } catch (err) {
        console.error('Error in getMyTickets:', err);
        return res.status(500).json({ error: 'Server error', message: err.message });
    }
};
// Get ticket by ID
exports.getTicket = async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id).populate('concertId');

        if (!ticket) {
            return res.status(404).json({ msg: 'Ticket not found' });
        }

        res.json(ticket);
    } catch (err) {
        console.error('Error in getTicket:', err);

        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Ticket not found - invalid ID' });
        }

        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// Verify ticket
exports.verifyTicket = async (req, res) => {
    try {
        console.log(`Verifying ticket: ${req.params.id} by user ${req.user.walletAddress}`);

        const ticket = await Ticket.findById(req.params.id).populate('concertId');

        if (!ticket) {
            return res.status(404).json({ msg: 'Ticket not found' });
        }

        // Check if ticket already used
        if (ticket.status === 'used') {
            return res.status(400).json({ msg: 'Ticket already used' });
        }

        // Update ticket status
        ticket.status = 'used';

        // Add to transaction history
        ticket.transactionHistory.push({
            action: 'use',
            from: req.user.walletAddress,
            timestamp: Date.now()
        });

        await ticket.save();
        console.log(`Ticket ${req.params.id} marked as used`);

        // If blockchain integration is enabled, update on blockchain too
        try {
            if (blockchainService.isEnabled && ticket.mintAddress) {
                await blockchainService.useTicket(
                    req.user.walletAddress,
                    ticket.mintAddress
                );

                console.log(`Ticket used on blockchain: ${ticket.mintAddress}`);
            }
        } catch (blockchainError) {
            console.error('Blockchain verification error:', blockchainError);
            // We continue even if blockchain verification failed
        }

        res.json({
            success: true,
            ticket
        });
    } catch (err) {
        console.error('Error in verifyTicket:', err);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// Transfer ticket to another wallet
exports.transferTicket = async (req, res) => {
    try {
        const { recipientWallet } = req.body;

        if (!recipientWallet) {
            return res.status(400).json({ msg: 'Recipient wallet address is required' });
        }

        console.log(`Transferring ticket ${req.params.id} from ${req.user.walletAddress} to ${recipientWallet}`);

        const ticket = await Ticket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({ msg: 'Ticket not found' });
        }

        // Check if user owns the ticket
        if (ticket.owner !== req.user.walletAddress) {
            return res.status(401).json({ msg: 'Not authorized to transfer this ticket' });
        }

        // Check if ticket already used
        if (ticket.status === 'used') {
            return res.status(400).json({ msg: 'Cannot transfer a used ticket' });
        }

        // Update owner
        const previousOwner = ticket.owner;
        ticket.owner = recipientWallet;
        ticket.status = 'transferred';

        // Add to transaction history
        ticket.transactionHistory.push({
            action: 'transfer',
            from: req.user.walletAddress,
            to: recipientWallet,
            timestamp: Date.now()
        });

        await ticket.save();
        console.log(`Ticket transferred successfully to ${recipientWallet}`);

        // If blockchain integration is enabled, transfer on blockchain too
        try {
            if (blockchainService.isEnabled && ticket.mintAddress) {
                // Here you would call your blockchain service to transfer the token
                // This depends on your specific implementation
                console.log(`Blockchain transfer would happen here for mint ${ticket.mintAddress}`);
            }
        } catch (blockchainError) {
            console.error('Blockchain transfer error:', blockchainError);
            // We continue even if blockchain transfer failed
        }

        res.json({
            success: true,
            ticket,
            previousOwner
        });
    } catch (err) {
        console.error('Error in transferTicket:', err);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// Get minted seats for a concert
exports.getMintedSeatsForConcert = async (req, res) => {
    try {
        const { concertId } = req.params;

        console.log(`Getting minted seats for concert: ${concertId}`);

        // Validate concertId
        if (!mongoose.Types.ObjectId.isValid(concertId)) {
            return res.status(400).json({ msg: 'Invalid concert ID format' });
        }

        // Find all tickets for this concert
        const tickets = await Ticket.find({ concertId });

        // Extract seat numbers
        const seats = tickets.map(ticket => ticket.seatNumber);

        console.log(`Found ${seats.length} minted seats for concert ${concertId}`);

        res.json({ seats });
    } catch (err) {
        console.error('Error in getMintedSeatsForConcert:', err);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// Get tickets for a specific concert (admin only)
exports.getTicketsForConcert = async (req, res) => {
    try {
        const { concertId } = req.params;

        console.log(`Admin requesting tickets for concert: ${concertId}`);

        // Find all tickets for this concert
        const tickets = await Ticket.find({ concertId }).populate('concertId');

        console.log(`Found ${tickets.length} tickets for concert ${concertId}`);

        res.json(tickets);
    } catch (err) {
        console.error('Error in getTicketsForConcert:', err);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// Get ticket stats
exports.getTicketStats = async (req, res) => {
    try {
        // Count total tickets
        const totalTickets = await Ticket.countDocuments();

        // Count by status
        const mintedTickets = await Ticket.countDocuments({ status: 'minted' });
        const usedTickets = await Ticket.countDocuments({ status: 'used' });
        const transferredTickets = await Ticket.countDocuments({ status: 'transferred' });

        // Get top concerts by tickets sold
        const topConcerts = await Ticket.aggregate([
            {
                $group: {
                    _id: '$concertId',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);

        // Populate concert details
        const populatedTopConcerts = [];
        for (const item of topConcerts) {
            const concert = await Concert.findById(item._id);
            if (concert) {
                populatedTopConcerts.push({
                    concertId: item._id,
                    name: concert.name,
                    venue: concert.venue,
                    ticketCount: item.count
                });
            }
        }

        res.json({
            totalTickets,
            byStatus: {
                minted: mintedTickets,
                used: usedTickets,
                transferred: transferredTickets
            },
            topConcerts: populatedTopConcerts
        });
    } catch (err) {
        console.error('Error in getTicketStats:', err);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// Admin function to cancel a ticket
exports.cancelTicket = async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({ msg: 'Ticket not found' });
        }

        // Update status
        ticket.status = 'cancelled';

        // Add to transaction history
        ticket.transactionHistory.push({
            action: 'cancel',
            from: req.user.walletAddress,
            timestamp: Date.now()
        });

        await ticket.save();

        // Update available seats in concert
        const concert = await Concert.findById(ticket.concertId);
        if (concert) {
            const section = concert.sections.find(s => s.name === ticket.sectionName);
            if (section) {
                section.availableSeats += 1;
                concert.ticketsSold -= 1;
                await concert.save();
            }
        }

        res.json({
            success: true,
            ticket
        });
    } catch (err) {
        console.error('Error in cancelTicket:', err);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};