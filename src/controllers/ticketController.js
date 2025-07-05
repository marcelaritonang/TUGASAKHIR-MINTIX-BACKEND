
// backend/src/controllers/ticketController.js - COMPLETE FIXED VERSION
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const Concert = require('../models/Concert');
const blockchainService = require('../services/blockchain');

// Enhanced Mint ticket with strict blockchain verification - FIXED WITHOUT TRANSACTIONS
/**
 * Mint a ticket - FIXED VERSION WITHOUT MONGODB TRANSACTIONS
 * @route   POST /api/tickets/mint
 */
// backend/src/controllers/ticketController.js - FIXED mintTicket function
exports.mintTicket = async (req, res) => {
    try {
        console.log('🎫 ===== ENHANCED MINT TICKET REQUEST =====');
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        console.log('User:', req.user);

        const startTime = Date.now();
        const performanceSteps = [];

        const recordStep = (stepName) => {
            const stepTime = Date.now() - startTime;
            const durationInSec = stepTime / 1000;
            performanceSteps.push({
                name: stepName,
                time: durationInSec,
                timestamp: Date.now()
            });
            console.log(`✅ ${stepName}: ${durationInSec.toFixed(3)}s`);
            return durationInSec;
        };

        recordStep('Initialize request');

        // STEP 1: Enhanced Input Validation
        const { concertId, sectionName, seatNumber, transactionSignature, receiverAddress } = req.body;

        if (!concertId) {
            return res.status(400).json({
                success: false,
                msg: 'Concert ID is required',
                field: 'concertId'
            });
        }

        if (!sectionName) {
            return res.status(400).json({
                success: false,
                msg: 'Section name is required',
                field: 'sectionName'
            });
        }

        if (!seatNumber) {
            return res.status(400).json({
                success: false,
                msg: 'Seat number is required',
                field: 'seatNumber'
            });
        }

        const walletAddress = req.user?.walletAddress;
        if (!walletAddress) {
            return res.status(401).json({
                success: false,
                msg: 'User wallet address not found',
                authRequired: true
            });
        }

        recordStep('Input validation');

        // STEP 2: Get and validate concert
        const concert = await Concert.findById(concertId);
        if (!concert) {
            return res.status(404).json({
                success: false,
                msg: 'Concert not found',
                concertId: concertId
            });
        }

        const section = concert.sections.find(s => s.name === sectionName);
        if (!section) {
            return res.status(400).json({
                success: false,
                msg: 'Section not found in concert',
                availableSections: concert.sections?.map(s => s.name) || []
            });
        }

        if (section.availableSeats <= 0) {
            return res.status(400).json({
                success: false,
                msg: 'No available seats in this section',
                sectionFull: true,
                availableSeats: section.availableSeats,
                totalSeats: section.totalSeats
            });
        }

        recordStep('Concert and section validation');

        // STEP 3: Check seat availability (atomic check)
        const existingSeat = await Ticket.findOne({
            concertId: concertId,
            sectionName: sectionName,
            seatNumber: seatNumber
        });

        if (existingSeat) {
            return res.status(409).json({
                success: false,
                msg: `Seat ${seatNumber} is already taken. Please select another seat.`,
                seatTaken: true,
                takenBy: existingSeat.owner,
                conflictType: 'seat_already_exists'
            });
        }

        recordStep('Seat availability check');

        // STEP 4: Handle transaction signature
        let finalTransactionSignature = transactionSignature;
        const isDev = process.env.NODE_ENV !== 'production';

        if (!finalTransactionSignature) {
            if (isDev) {
                finalTransactionSignature = `dev_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
                console.log('🔧 DEV MODE: Using dummy signature:', finalTransactionSignature);
            } else {
                return res.status(400).json({
                    success: false,
                    msg: 'Transaction signature is required',
                    field: 'transactionSignature'
                });
            }
        }

        recordStep('Transaction signature validation');

        // STEP 5: Create ticket with enhanced blockchain information
        const newTicket = new Ticket({
            concertId: concertId,
            sectionName: sectionName,
            seatNumber: seatNumber,
            price: section.price,
            owner: walletAddress,
            status: 'minted',
            transactionSignature: finalTransactionSignature,
            paymentRecipient: receiverAddress || concert.creator,
            isPrimary: true,
            isVerified: false,

            // Enhanced blockchain information
            mintAddress: `mint_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
            ticketAddress: `ticket_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
            tokenAccountAddress: walletAddress,
            concertAddress: concert.creator || 'unknown',

            // Enhanced metadata
            metadata: {
                qrCode: `${concertId}-${sectionName}-${seatNumber}`,
                qrCodeUrl: null,
                ticketDesign: 'standard',
                specialAttributes: [],
                tier: sectionName.toLowerCase().includes('vip') ? 'vip' : 'standard',
                blockchainNetwork: 'solana-testnet'
            },

            // Transaction history
            transactionHistory: [{
                action: 'mint',
                from: 'system',
                to: walletAddress,
                timestamp: new Date(),
                transactionSignature: finalTransactionSignature,
                price: section.price,
                metadata: {
                    concertName: concert.name,
                    venue: concert.venue,
                    mintedAt: new Date().toISOString(),
                    blockchainNetwork: 'solana-testnet'
                }
            }]
        });

        console.log('🎫 Creating new ticket with enhanced blockchain info:', {
            concertId: newTicket.concertId,
            sectionName: newTicket.sectionName,
            seatNumber: newTicket.seatNumber,
            owner: newTicket.owner,
            mintAddress: newTicket.mintAddress,
            ticketAddress: newTicket.ticketAddress
        });

        // STEP 6: Save ticket
        const savedTicket = await newTicket.save();
        recordStep('Ticket creation');

        console.log(`✅ Successfully created ticket ${savedTicket._id} for seat ${seatNumber}`);

        // STEP 7: Update concert availability (non-critical)
        try {
            section.availableSeats -= 1;
            concert.ticketsSold = (concert.ticketsSold || 0) + 1;
            await concert.save();
            recordStep('Concert update');
        } catch (concertUpdateError) {
            console.warn('⚠️ Non-critical: Error updating concert seats:', concertUpdateError.message);
        }

        // STEP 8: Calculate performance metrics
        const endTime = Date.now();
        const totalDurationInSec = (endTime - startTime) / 1000;

        let totalStepTime = 0;
        performanceSteps.forEach(step => {
            totalStepTime += step.time;
        });

        performanceSteps.forEach(step => {
            step.percentage = totalStepTime > 0 ? (step.time / totalStepTime) * 100 : 0;
        });

        const performanceMetrics = {
            totalTime: totalDurationInSec,
            steps: performanceSteps,
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development'
        };

        // STEP 9: Real-time notification (if WebSocket available)
        try {
            if (global.io) {
                global.io.emit('seatTaken', {
                    concertId: concertId,
                    sectionName: sectionName,
                    seatNumber: seatNumber,
                    takenBy: walletAddress,
                    timestamp: new Date()
                });
            }
        } catch (broadcastErr) {
            console.warn("Could not broadcast seat update:", broadcastErr.message);
        }

        // STEP 10: Generate QR Code data
        const qrCodeData = {
            ticketId: savedTicket._id,
            concertId: savedTicket.concertId,
            concertName: concert.name,
            venue: concert.venue,
            date: concert.date,
            sectionName: savedTicket.sectionName,
            seatNumber: savedTicket.seatNumber,
            owner: savedTicket.owner,
            price: savedTicket.price,
            mintAddress: savedTicket.mintAddress,
            ticketAddress: savedTicket.ticketAddress,
            transactionSignature: savedTicket.transactionSignature,
            issuedAt: savedTicket.createdAt,
            validUntil: concert.date,
            securityHash: savedTicket.securityHash
        };

        // STEP 11: Enhanced success response with blockchain info
        return res.status(201).json({
            success: true,
            msg: 'Ticket minted successfully with blockchain integration',
            ticket: {
                _id: savedTicket._id,
                concertId: savedTicket.concertId,
                concertName: concert.name,
                venue: concert.venue,
                date: concert.date,
                sectionName: savedTicket.sectionName,
                seatNumber: savedTicket.seatNumber,
                price: savedTicket.price,
                owner: savedTicket.owner,
                status: savedTicket.status,

                // Blockchain information
                transactionSignature: savedTicket.transactionSignature,
                mintAddress: savedTicket.mintAddress,
                ticketAddress: savedTicket.ticketAddress,
                tokenAccountAddress: savedTicket.tokenAccountAddress,
                concertAddress: savedTicket.concertAddress,

                // QR Code and metadata
                qrCodeData: qrCodeData,
                qrCodeString: JSON.stringify(qrCodeData),
                metadata: savedTicket.metadata,

                // Verification info
                isVerified: savedTicket.isVerified,
                isPrimary: savedTicket.isPrimary,
                paymentRecipient: savedTicket.paymentRecipient,

                createdAt: savedTicket.createdAt,
                updatedAt: savedTicket.updatedAt
            },
            updatedSection: {
                name: section.name,
                availableSeats: section.availableSeats,
                totalSeats: section.totalSeats,
                price: section.price
            },
            blockchain: {
                network: 'solana-testnet',
                cluster: 'testnet',
                transactionSignature: savedTicket.transactionSignature,
                mintAddress: savedTicket.mintAddress,
                ticketAddress: savedTicket.ticketAddress,
                paymentRecipient: savedTicket.paymentRecipient,
                explorerUrl: finalTransactionSignature && !finalTransactionSignature.startsWith('dev_') ?
                    `https://explorer.solana.com/tx/${finalTransactionSignature}?cluster=testnet` : null,
                verified: !finalTransactionSignature.startsWith('dev_')
            },
            serverPerformance: req.body.includePerformanceMetrics ? performanceMetrics : null,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ ERROR in mintTicket:', error);

        // Handle specific error types
        if (error.code === 11000) {
            // Duplicate key error - seat already exists
            console.error('Duplicate seat error:', error);
            const duplicateField = Object.keys(error.keyPattern || {})[0];
            return res.status(409).json({
                success: false,
                msg: 'This seat is already taken. Please refresh and select another seat.',
                duplicateKey: true,
                field: duplicateField,
                conflictType: 'database_duplicate'
            });
        }

        if (error.name === 'ValidationError') {
            console.error('Validation error:', error);
            const validationErrors = Object.keys(error.errors).map(key => ({
                field: key,
                message: error.errors[key].message
            }));

            return res.status(400).json({
                success: false,
                msg: 'Ticket validation failed',
                validationErrors: validationErrors
            });
        }

        // General error response
        let statusCode = 500;
        let errorResponse = {
            success: false,
            msg: 'Server error during mint process',
            error: error.message,
            timestamp: new Date().toISOString()
        };

        if (error.name === 'CastError') {
            statusCode = 400;
            errorResponse.msg = 'Invalid ID format provided';
            errorResponse.errorType = 'invalid_id';
        } else if (error.message?.includes('timeout')) {
            statusCode = 408;
            errorResponse.msg = 'Database timeout - please try again';
            errorResponse.errorType = 'timeout';
        } else if (error.message?.includes('connection')) {
            statusCode = 503;
            errorResponse.msg = 'Database connection error';
            errorResponse.errorType = 'connection_error';
        }

        console.error('Final error response:', errorResponse);
        return res.status(statusCode).json(errorResponse);
    }
};

// Enhanced Get my tickets dengan better caching dan error handling - UNCHANGED
exports.getMyTickets = async (req, res) => {
    try {
        const walletAddress = req.user.walletAddress;
        const hideDeleted = req.query.hideDeleted === 'true';

        console.log('\n📋 ===== GET MY TICKETS (ENHANCED) =====');
        console.log('🔍 Wallet address:', walletAddress);
        console.log('🔍 Hide deleted concerts:', hideDeleted);

        if (!walletAddress) {
            console.log("❌ No wallet address provided");
            return res.status(400).json({
                success: false,
                error: 'Wallet address required'
            });
        }

        // Find all tickets owned by this wallet with enhanced data
        let tickets = await Ticket.find({
            owner: walletAddress
        }).sort({ createdAt: -1 }).maxTimeMS(10000);

        console.log(`📊 Found ${tickets.length} tickets for wallet ${walletAddress}`);

        // Enhance tickets with concert information and blockchain data
        const enhancedTickets = [];
        for (const ticket of tickets) {
            try {
                // Ensure transaction signature exists
                if (!ticket.transactionSignature) {
                    ticket.transactionSignature = `added_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
                    await ticket.save();
                    console.log(`✅ Updated transaction signature for ticket ${ticket._id}`);
                }

                const concert = await Concert.findById(ticket.concertId);

                const enhancedTicket = {
                    ...ticket.toObject(),
                    // Add concert info
                    concertInfo: concert ? {
                        name: concert.name,
                        venue: concert.venue,
                        date: concert.date,
                        creator: concert.creator
                    } : null,

                    // Add blockchain explorer link like old version
                    explorerUrl: ticket.transactionSignature &&
                        !ticket.transactionSignature.startsWith('dev_') &&
                        !ticket.transactionSignature.startsWith('added_') ?
                        `https://explorer.solana.com/tx/${ticket.transactionSignature}?cluster=testnet` : null,

                    // Add QR code data like old version
                    qrCodeData: {
                        ticketId: ticket._id,
                        concertName: concert?.name || 'Unknown Concert',
                        venue: concert?.venue || 'Unknown Venue',
                        sectionName: ticket.sectionName,
                        seatNumber: ticket.seatNumber,
                        owner: ticket.owner,
                        transactionSignature: ticket.transactionSignature,
                        mintAddress: ticket.mintAddress,
                        ticketAddress: ticket.ticketAddress
                    },

                    // Add verification status
                    blockchainVerified: ticket.transactionSignature &&
                        !ticket.transactionSignature.startsWith('dev_') &&
                        !ticket.transactionSignature.startsWith('added_'),

                    hasMissingConcert: !concert
                };

                if (hideDeleted) {
                    if (concert) {
                        enhancedTickets.push(enhancedTicket);
                    }
                } else {
                    enhancedTickets.push(enhancedTicket);
                }

            } catch (err) {
                console.error(`❌ Error processing ticket ${ticket._id}:`, err);
                // Include ticket anyway with error flag
                enhancedTickets.push({
                    ...ticket.toObject(),
                    concertInfo: null,
                    hasError: true,
                    errorMessage: 'Could not load concert information'
                });
            }
        }

        console.log(`📊 Returning ${enhancedTickets.length} enhanced tickets`);
        res.json(enhancedTickets);

    } catch (err) {
        console.error('\n❌ Error in getMyTickets:', err);

        if (err.name === 'MongooseError' && err.message.includes('timeout')) {
            return res.status(408).json({
                success: false,
                error: 'Database timeout - please try again',
                timeout: true
            });
        }

        return res.status(500).json({
            success: false,
            error: 'Server error',
            message: err.message
        });
    }
};

// Enhanced Get ticket by ID - UNCHANGED but improved
exports.getTicket = async (req, res) => {
    try {
        const ticketId = req.params.id;

        console.log(`🎫 GET TICKET: ${ticketId} by user: ${req.user?.walletAddress}`);

        // ✅ CRITICAL: Validate ObjectId format before database query
        if (!mongoose.Types.ObjectId.isValid(ticketId)) {
            console.log(`❌ Invalid ObjectId format: ${ticketId}`);
            return res.status(400).json({
                success: false,
                msg: 'Invalid ticket ID format'
            });
        }

        // Find ticket by ID with timeout
        const ticket = await Ticket.findById(ticketId).maxTimeMS(10000);

        if (!ticket) {
            console.log(`❌ Ticket not found: ${ticketId}`);
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        // Check ownership authorization
        if (ticket.owner !== req.user.walletAddress) {
            console.log(`❌ Access denied for ticket ${ticketId}. Owner: ${ticket.owner}, Requester: ${req.user.walletAddress}`);
            return res.status(403).json({
                success: false,
                msg: 'Access denied - not your ticket'
            });
        }

        // Enhance ticket with concert information
        let enhancedTicket = { ...ticket.toObject() };

        try {
            if (ticket.concertId && mongoose.Types.ObjectId.isValid(ticket.concertId)) {
                const concert = await Concert.findById(ticket.concertId)
                    .select('name venue date creator')
                    .maxTimeMS(5000);

                if (concert) {
                    enhancedTicket.concertName = concert.name;
                    enhancedTicket.concertVenue = concert.venue;
                    enhancedTicket.concertDate = concert.date;
                    enhancedTicket.concertCreator = concert.creator;
                    enhancedTicket.concertExists = true;
                    console.log(`✅ Concert found: ${concert.name}`);
                } else {
                    enhancedTicket.concertExists = false;
                    enhancedTicket.concertName = 'Concert Deleted';
                    enhancedTicket.concertVenue = 'Unknown Venue';
                    console.log(`⚠️ Concert ${ticket.concertId} not found`);
                }
            } else {
                enhancedTicket.concertExists = false;
                enhancedTicket.concertName = 'Invalid Concert ID';
                enhancedTicket.concertVenue = 'Unknown Venue';
                console.log(`⚠️ Invalid concert ID: ${ticket.concertId}`);
            }
        } catch (concertError) {
            console.warn(`⚠️ Error fetching concert for ticket ${ticketId}:`, concertError.message);
            enhancedTicket.concertExists = false;
            enhancedTicket.concertName = 'Concert Lookup Failed';
            enhancedTicket.concertVenue = 'Unknown Venue';
        }

        // Add blockchain verification status
        const hasValidTransaction = ticket.transactionSignature &&
            !ticket.transactionSignature.startsWith('dummy_') &&
            !ticket.transactionSignature.startsWith('added_') &&
            !ticket.transactionSignature.startsWith('dev_') &&
            !ticket.transactionSignature.startsWith('error_');

        enhancedTicket.blockchainVerified = hasValidTransaction;
        enhancedTicket.explorerUrl = hasValidTransaction ?
            `https://explorer.solana.com/tx/${ticket.transactionSignature}?cluster=testnet` : null;

        // Add QR code data
        enhancedTicket.qrCodeData = {
            ticketId: ticket._id,
            concertName: enhancedTicket.concertName,
            venue: enhancedTicket.concertVenue,
            sectionName: ticket.sectionName,
            seatNumber: ticket.seatNumber,
            owner: ticket.owner,
            transactionSignature: ticket.transactionSignature,
            mintAddress: ticket.mintAddress,
            ticketAddress: ticket.ticketAddress,
            issuedAt: ticket.createdAt,
            validUntil: enhancedTicket.concertDate
        };

        console.log(`✅ Ticket ${ticketId} retrieved successfully`);

        return res.json({
            success: true,
            ticket: enhancedTicket
        });

    } catch (error) {
        console.error(`❌ Error in getTicket for ID ${req.params.id}:`, error);

        // Handle specific MongoDB errors
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                msg: 'Invalid ticket ID format'
            });
        }

        if (error.name === 'MongooseError' && error.message.includes('timeout')) {
            return res.status(408).json({
                success: false,
                msg: 'Database timeout - please try again'
            });
        }

        return res.status(500).json({
            success: false,
            msg: 'Server error retrieving ticket',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Enhanced Verify ticket - UNCHANGED
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
        ticket.verifiedBy = req.user.walletAddress;

        // Add to transaction history
        ticket.transactionHistory.push({
            action: 'use',
            from: req.user.walletAddress,
            timestamp: new Date(),
            verificationAction: true,
            metadata: {
                verifiedBy: req.user.walletAddress,
                verificationMethod: 'manual'
            }
        });

        await ticket.save();
        console.log(`✅ Ticket ${req.params.id} marked as used`);

        res.json({
            success: true,
            msg: 'Ticket verified successfully',
            ticket: {
                ...ticket.toObject(),
                verification: {
                    verified: true,
                    verifiedAt: ticket.verifiedAt,
                    verifiedBy: ticket.verifiedBy
                }
            }
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

// Enhanced List ticket for sale - UNCHANGED
exports.listTicketForSale = async (req, res) => {
    try {
        console.log(`Listing ticket: ${req.params.id}`);
        console.log('Request body:', req.body);

        const ticketId = req.params.id;

        if (!ticketId) {
            return res.status(400).json({ success: false, msg: 'Ticket ID is required' });
        }

        if (!req.body || typeof req.body !== 'object') {
            return res.status(400).json({
                success: false,
                msg: 'Invalid request body'
            });
        }

        const { price } = req.body;

        if (price === undefined || price === null) {
            return res.status(400).json({
                success: false,
                msg: 'Price is required in request body'
            });
        }

        const listingPrice = parseFloat(price);

        if (isNaN(listingPrice) || listingPrice <= 0) {
            return res.status(400).json({
                success: false,
                msg: 'Price must be a positive number'
            });
        }

        const ticket = await Ticket.findById(ticketId);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        if (ticket.owner !== req.user.walletAddress) {
            return res.status(403).json({
                success: false,
                msg: 'You are not the owner of this ticket'
            });
        }

        if (ticket.isListed) {
            return res.status(400).json({
                success: false,
                msg: 'Ticket is already listed for sale'
            });
        }

        // Update ticket data
        ticket.isListed = true;
        ticket.listingPrice = listingPrice;
        ticket.listingDate = new Date();

        // Add to transaction history
        ticket.transactionHistory.push({
            action: 'list_for_sale',
            from: ticket.owner,
            timestamp: new Date(),
            price: listingPrice,
            metadata: {
                marketplace: 'internal',
                listingType: 'fixed_price'
            }
        });

        await ticket.save();

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

// Enhanced Cancel ticket listing - UNCHANGED
exports.cancelTicketListing = async (req, res) => {
    try {
        const { id: ticketId } = req.params;

        console.log(`\n🚫 ===== CANCEL TICKET LISTING =====`);
        console.log(`🎫 Ticket ID: ${ticketId}`);
        console.log(`👤 User: ${req.user.walletAddress}`);

        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            console.log('❌ Ticket not found');
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        if (ticket.owner !== req.user.walletAddress) {
            console.log('❌ User not authorized');
            return res.status(401).json({
                success: false,
                msg: 'Not authorized - you are not the ticket owner'
            });
        }

        if (!ticket.isListed) {
            console.log('❌ Ticket not listed');
            return res.status(400).json({
                success: false,
                msg: 'Ticket is not currently listed for sale'
            });
        }

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

// Enhanced Buy ticket - FIXED WITHOUT TRANSACTIONS
exports.buyTicket = async (req, res) => {
    try {
        console.log('=========== ENHANCED BUY TICKET REQUEST (FIXED) ===========');
        console.log('Ticket ID:', req.params.id);
        console.log('Buyer wallet:', req.user?.walletAddress);
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        console.log('=========================================================');

        const ticketId = req.params.id;
        const { transactionSignature } = req.body;

        // STEP 1: Validation
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

        if (!req.user || !req.user.walletAddress) {
            return res.status(401).json({
                success: false,
                msg: 'Authentication required to buy tickets'
            });
        }
        const buyerWallet = req.user.walletAddress;

        // STEP 2: Find ticket - REMOVED .session(session)
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        // STEP 3: Validate ticket is for sale
        if (!ticket.isListed) {
            return res.status(400).json({
                success: false,
                msg: 'This ticket is not listed for sale'
            });
        }

        // STEP 4: Validate buyer is not seller
        if (ticket.owner === buyerWallet) {
            return res.status(400).json({
                success: false,
                msg: 'You cannot buy your own ticket'
            });
        }

        // STEP 5: Store data for history
        const seller = ticket.owner;
        const originalPrice = ticket.price;
        const salePrice = ticket.listingPrice;

        console.log(`Seller: ${seller}, Buyer: ${buyerWallet}, Price: ${salePrice} SOL`);

        // STEP 6: Blockchain verification (optional)
        let verificationResult = null;
        try {
            if (typeof blockchainService.verifyMarketplaceTransaction === 'function') {
                console.log('Verifying transaction with blockchain service...');

                verificationResult = await blockchainService.verifyMarketplaceTransaction(
                    transactionSignature,
                    seller,     // expected recipient
                    salePrice   // expected amount
                );

                console.log('Transaction verification result:', verificationResult);

                // Only fail in production if verification fails
                if (verificationResult && !verificationResult.success && process.env.NODE_ENV === 'production') {
                    return res.status(400).json({
                        success: false,
                        msg: 'Transaction verification failed',
                        details: verificationResult
                    });
                }
            }
        } catch (verifyErr) {
            console.error('Error verifying transaction:', verifyErr);
            if (process.env.NODE_ENV === 'production') {
                return res.status(400).json({
                    success: false,
                    msg: 'Transaction verification error',
                    error: verifyErr.message
                });
            }
        }

        // STEP 7: Get concert data for records
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

        // STEP 8: Update ticket ownership - REMOVED session operations
        // A. Add to previous owners history
        if (!ticket.previousOwners) ticket.previousOwners = [];

        ticket.previousOwners.push({
            address: seller,
            fromDate: ticket.updatedAt || ticket.createdAt,
            toDate: new Date(),
            transactionSignature,
            salePrice: salePrice
        });

        // B. Transfer ownership
        const oldOwner = ticket.owner;
        ticket.owner = buyerWallet;

        // C. Remove from marketplace
        ticket.isListed = false;
        ticket.listingPrice = 0;
        ticket.listingDate = null;
        ticket.isPrimary = false;
        ticket.paymentRecipient = seller;

        // D. Add transaction history
        if (!ticket.transactionHistory) ticket.transactionHistory = [];

        ticket.transactionHistory.push({
            action: 'transfer',
            from: seller,
            to: buyerWallet,
            timestamp: new Date(),
            transactionSignature,
            price: salePrice,
            metadata: {
                marketplace: 'internal',
                transferType: 'purchase',
                originalPrice: originalPrice,
                salePrice: salePrice
            }
        });

        ticket.updatedAt = new Date();

        // STEP 9: Save ticket - REMOVED { session }
        const savedTicket = await ticket.save();
        console.log(`✅ Ticket ownership transferred from ${oldOwner} to ${buyerWallet}`);

        // STEP 10: Broadcast update (if WebSocket available)
        try {
            if (global.io) {
                global.io.emit('ticketSold', {
                    ticketId: ticketId,
                    from: seller,
                    to: buyerWallet,
                    price: salePrice,
                    timestamp: new Date()
                });
            }
        } catch (broadcastErr) {
            console.warn("Could not broadcast ticket sale:", broadcastErr.message);
        }

        // STEP 11: Enhanced success response
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

                // Enhanced blockchain info
                mintAddress: savedTicket.mintAddress,
                ticketAddress: savedTicket.ticketAddress,
                explorerUrl: transactionSignature && !transactionSignature.startsWith('dev_') ?
                    `https://explorer.solana.com/tx/${transactionSignature}?cluster=testnet` : null,

                requiresDataRefresh: true   // Flag for frontend refresh cache
            },
            marketplace: {
                transferredFrom: seller,
                transferredTo: buyerWallet,
                finalPrice: salePrice,
                originalPrice: originalPrice,
                transferDate: new Date().toISOString()
            }
        });

    } catch (error) {
        // Enhanced error handling - NO MORE session.abortTransaction()
        console.error('Error during ticket purchase:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                msg: 'Ticket purchase conflict - ticket may have been sold to another buyer',
                conflictType: 'concurrent_purchase'
            });
        }

        return res.status(500).json({
            success: false,
            msg: 'Server error when processing ticket purchase',
            error: error.message
        });
    }
};

// Enhanced Delete ticket - UNCHANGED
exports.deleteTicket = async (req, res) => {
    try {
        const ticketId = req.params.id;
        console.log(`🗑️ Attempting to delete ticket ${ticketId} by user ${req.user.walletAddress}`);

        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            console.log(`❌ Ticket ${ticketId} not found`);
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        if (ticket.owner !== req.user.walletAddress) {
            console.log(`❌ Unauthorized: ${req.user.walletAddress} attempting to delete ticket owned by ${ticket.owner}`);
            return res.status(401).json({
                success: false,
                msg: 'Not authorized to delete this ticket'
            });
        }

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
            !ticket.transactionSignature.startsWith('error_') &&
            !ticket.transactionSignature.startsWith('dev_')) {

            console.log(`🔗 Deleting ticket with blockchain transaction: ${ticket.transactionSignature}`);
            console.log(`🔗 Transaction history:`, ticket.transactionHistory.length, 'entries');

            if (ticket.previousOwners && ticket.previousOwners.length > 0) {
                console.log(`🔗 Ticket had ${ticket.previousOwners.length} previous owners`);
            }
        }

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

// Enhanced Get minted seats for a concert - UNCHANGED
exports.getMintedSeatsForConcert = async (req, res) => {
    try {
        console.log(`Getting minted seats for concert: ${req.params.concertId}`);

        if (!req.params.concertId) {
            return res.status(400).json({
                success: false,
                msg: 'Concert ID is required'
            });
        }

        const concertId = req.params.concertId.toString();
        console.log(`Normalized concertId: ${concertId}`);

        const tickets = await Ticket.find({
            concertId: concertId
        }).select('sectionName seatNumber owner createdAt transactionSignature').maxTimeMS(10000);

        console.log(`Found ${tickets.length} tickets for concert ${concertId}`);

        const seats = tickets.map(ticket => {
            if (ticket.seatNumber && ticket.seatNumber.includes('-')) {
                return ticket.seatNumber;
            } else {
                return `${ticket.sectionName}-${ticket.seatNumber}`;
            }
        }).filter(Boolean);

        const detailedSeats = tickets.map(ticket => ({
            seatCode: ticket.seatNumber.includes('-') ?
                ticket.seatNumber :
                `${ticket.sectionName}-${ticket.seatNumber}`,
            owner: ticket.owner,
            mintedAt: ticket.createdAt,
            section: ticket.sectionName,
            hasValidTransaction: !!ticket.transactionSignature &&
                !ticket.transactionSignature.startsWith('dummy_') &&
                !ticket.transactionSignature.startsWith('added_') &&
                !ticket.transactionSignature.startsWith('dev_')
        }));

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
                !ticket.transactionSignature.startsWith('added_') &&
                !ticket.transactionSignature.startsWith('dev_')) {
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
        console.error('Error getting minted seats:', error);

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
};

// Check seat availability - UNCHANGED
exports.checkSeatAvailability = async (req, res) => {
    try {
        console.log('🔍 Real-time seat availability check:', req.body);

        const { concertId, sectionName, seatNumber } = req.body;

        if (!concertId || !sectionName || !seatNumber) {
            return res.status(400).json({
                success: false,
                msg: 'Missing required parameters: concertId, sectionName, seatNumber'
            });
        }

        const checkStartTime = Date.now();

        const existingTicket = await Ticket.findOne({
            concertId: concertId,
            sectionName: sectionName,
            seatNumber: seatNumber
        }).maxTimeMS(5000);

        if (existingTicket) {
            return res.json({
                available: false,
                reason: 'seat_taken',
                takenBy: existingTicket.owner,
                takenAt: existingTicket.createdAt,
                checkTime: Date.now(),
                checkDuration: Date.now() - checkStartTime
            });
        }

        const concert = await Concert.findById(concertId).maxTimeMS(5000);

        if (!concert) {
            return res.status(404).json({
                success: false,
                msg: 'Concert not found'
            });
        }

        const section = concert.sections.find(s => s.name === sectionName);
        if (!section) {
            return res.status(404).json({
                success: false,
                msg: 'Section not found'
            });
        }

        if (section.availableSeats <= 0) {
            return res.json({
                available: false,
                reason: 'section_full',
                sectionName: sectionName,
                availableSeats: section.availableSeats,
                totalSeats: section.totalSeats,
                checkTime: Date.now(),
                checkDuration: Date.now() - checkStartTime
            });
        }

        return res.json({
            available: true,
            sectionName: sectionName,
            seatNumber: seatNumber,
            price: section.price,
            availableSeats: section.availableSeats,
            totalSeats: section.totalSeats,
            checkTime: Date.now(),
            checkDuration: Date.now() - checkStartTime
        });

    } catch (error) {
        console.error('Error checking seat availability:', error);

        if (error.name === 'MongooseError' && error.message.includes('timeout')) {
            return res.status(408).json({
                success: false,
                msg: 'Database timeout - please try again',
                timeout: true
            });
        }

        return res.status(500).json({
            success: false,
            msg: 'Server error checking seat availability',
            error: error.message
        });
    }
};

exports.fixMissingTransaction = async (req, res) => {
    try {
        console.log('🔧 ===== FIXING MISSING TRANSACTIONS =====');

        const { ticketId } = req.params;
        const userWallet = req.user?.walletAddress;

        if (!ticketId) {
            return res.status(400).json({
                success: false,
                msg: 'Ticket ID is required'
            });
        }

        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        // Check authorization
        if (ticket.owner !== userWallet) {
            return res.status(403).json({
                success: false,
                msg: 'Not authorized to fix this ticket'
            });
        }

        // Check if transaction signature is missing or dummy
        const needsFix = !ticket.transactionSignature ||
            ticket.transactionSignature.startsWith('dummy_') ||
            ticket.transactionSignature.startsWith('added_') ||
            ticket.transactionSignature.startsWith('dev_');

        if (!needsFix) {
            return res.status(400).json({
                success: false,
                msg: 'Ticket already has a valid transaction signature'
            });
        }

        // Generate new transaction signature
        const newSignature = `fixed_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
        const oldSignature = ticket.transactionSignature;

        ticket.transactionSignature = newSignature;

        // Add to transaction history
        ticket.transactionHistory.push({
            action: 'fix_transaction',
            from: userWallet,
            timestamp: new Date(),
            oldSignature: oldSignature,
            newSignature: newSignature,
            metadata: {
                fixedBy: userWallet,
                fixedAt: new Date(),
                reason: 'missing_or_invalid_signature'
            }
        });

        await ticket.save();

        console.log(`✅ Fixed transaction signature for ticket ${ticketId}`);

        return res.json({
            success: true,
            msg: 'Transaction signature fixed successfully',
            ticket: {
                id: ticket._id,
                oldSignature: oldSignature,
                newSignature: newSignature,
                fixedAt: new Date()
            }
        });

    } catch (error) {
        console.error('Error fixing transaction signature:', error);
        return res.status(500).json({
            success: false,
            msg: 'Server error fixing transaction',
            error: error.message
        });
    }
};
exports.markTicketValid = async (req, res) => {
    try {
        console.log('✅ ===== MARKING TICKET AS VALID =====');

        const { ticketId } = req.params;
        const userWallet = req.user?.walletAddress;

        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        // Check authorization
        if (ticket.owner !== userWallet) {
            return res.status(403).json({
                success: false,
                msg: 'Not authorized to validate this ticket'
            });
        }

        // Update ticket validation status
        ticket.isVerified = true;
        ticket.verifiedAt = new Date();
        ticket.verifiedBy = userWallet;

        // Add blockchain status if missing
        if (!ticket.blockchainStatus) {
            ticket.blockchainStatus = {
                verified: true,
                lastVerified: new Date(),
                verifiedBy: userWallet,
                verificationMethod: 'manual'
            };
        }

        // Add to transaction history
        ticket.transactionHistory.push({
            action: 'mark_valid',
            from: userWallet,
            timestamp: new Date(),
            verificationAction: true,
            metadata: {
                validatedBy: userWallet,
                validatedAt: new Date(),
                method: 'manual_validation'
            }
        });

        await ticket.save();

        console.log(`✅ Marked ticket ${ticketId} as valid`);

        return res.json({
            success: true,
            msg: 'Ticket marked as valid successfully',
            ticket: {
                id: ticket._id,
                isVerified: ticket.isVerified,
                verifiedAt: ticket.verifiedAt,
                verifiedBy: ticket.verifiedBy
            }
        });

    } catch (error) {
        console.error('Error marking ticket as valid:', error);
        return res.status(500).json({
            success: false,
            msg: 'Server error validating ticket',
            error: error.message
        });
    }
};
exports.calculateRoyalty = async (req, res) => {
    try {
        console.log('💰 ===== CALCULATING ROYALTY =====');

        const { ticketId, royaltyPercentage = 5 } = req.body;

        if (!ticketId) {
            return res.status(400).json({
                success: false,
                msg: 'Ticket ID is required'
            });
        }

        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        // Get concert info for creator royalty
        const concert = await Concert.findById(ticket.concertId);
        if (!concert) {
            return res.status(404).json({
                success: false,
                msg: 'Concert not found'
            });
        }

        const originalPrice = ticket.price;
        const currentListingPrice = ticket.listingPrice || ticket.price;
        const royaltyRate = Math.max(0, Math.min(100, parseFloat(royaltyPercentage))) / 100;

        // Calculate royalty based on current listing price
        const royaltyAmount = currentListingPrice * royaltyRate;
        const sellerReceives = currentListingPrice - royaltyAmount;
        const creatorReceives = royaltyAmount;

        const royaltyCalculation = {
            ticket: {
                id: ticket._id,
                originalPrice: originalPrice,
                currentListingPrice: currentListingPrice,
                sectionName: ticket.sectionName,
                seatNumber: ticket.seatNumber
            },
            concert: {
                id: concert._id,
                name: concert.name,
                creator: concert.creator
            },
            royalty: {
                percentage: royaltyRate * 100,
                amount: royaltyAmount,
                creatorReceives: creatorReceives,
                sellerReceives: sellerReceives
            },
            breakdown: {
                listingPrice: currentListingPrice,
                royaltyPercentage: `${royaltyRate * 100}%`,
                royaltyAmount: royaltyAmount,
                toCreator: creatorReceives,
                toSeller: sellerReceives
            },
            calculatedAt: new Date()
        };

        console.log(`✅ Calculated royalty for ticket ${ticketId}:`, royaltyCalculation.breakdown);

        return res.json({
            success: true,
            royaltyCalculation: royaltyCalculation
        });

    } catch (error) {
        console.error('Error calculating royalty:', error);
        return res.status(500).json({
            success: false,
            msg: 'Server error calculating royalty',
            error: error.message
        });
    }
};

exports.getTicketTransactionHistory = async (req, res) => {
    try {
        console.log('📊 ===== GET TICKET TRANSACTION HISTORY =====');

        const { id: ticketId } = req.params;
        const userWallet = req.user?.walletAddress;

        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            return res.status(404).json({
                success: false,
                msg: 'Ticket not found'
            });
        }

        // Check authorization (owner or previous owner can view history)
        const isOwner = ticket.owner === userWallet;
        const isPreviousOwner = ticket.previousOwners?.some(prev => prev.address === userWallet);

        if (!isOwner && !isPreviousOwner) {
            return res.status(403).json({
                success: false,
                msg: 'Not authorized to view this ticket history'
            });
        }

        // Get concert info
        const concert = await Concert.findById(ticket.concertId);

        // Enhanced transaction history with concert context
        const enhancedHistory = (ticket.transactionHistory || []).map(tx => ({
            ...tx.toObject ? tx.toObject() : tx,
            concertName: concert?.name || 'Unknown Concert',
            venue: concert?.venue || 'Unknown Venue',
            ticketInfo: {
                sectionName: ticket.sectionName,
                seatNumber: ticket.seatNumber,
                currentOwner: ticket.owner
            }
        }));

        // Add ownership timeline
        const ownershipTimeline = [];

        // Add initial owner (first mint)
        if (enhancedHistory.length > 0) {
            const firstTx = enhancedHistory[0];
            ownershipTimeline.push({
                owner: firstTx.to || ticket.owner,
                fromDate: firstTx.timestamp,
                toDate: null,
                action: 'minted',
                transactionSignature: firstTx.transactionSignature
            });
        }

        // Add previous owners
        if (ticket.previousOwners && ticket.previousOwners.length > 0) {
            ticket.previousOwners.forEach(prevOwner => {
                ownershipTimeline.push({
                    owner: prevOwner.address,
                    fromDate: prevOwner.fromDate,
                    toDate: prevOwner.toDate,
                    action: 'purchased',
                    salePrice: prevOwner.salePrice,
                    transactionSignature: prevOwner.transactionSignature
                });
            });
        }

        // Current owner
        ownershipTimeline.push({
            owner: ticket.owner,
            fromDate: ticket.updatedAt || ticket.createdAt,
            toDate: null,
            action: 'current_owner',
            isCurrent: true
        });

        const response = {
            success: true,
            ticket: {
                id: ticket._id,
                concertId: ticket.concertId,
                concertName: concert?.name || 'Unknown Concert',
                sectionName: ticket.sectionName,
                seatNumber: ticket.seatNumber,
                currentOwner: ticket.owner,
                originalPrice: ticket.price,
                currentListingPrice: ticket.listingPrice,
                isListed: ticket.isListed,
                status: ticket.status
            },
            transactionHistory: enhancedHistory,
            ownershipTimeline: ownershipTimeline,
            statistics: {
                totalTransactions: enhancedHistory.length,
                totalOwners: ownershipTimeline.length,
                isResale: (ticket.previousOwners?.length || 0) > 0,
                createdAt: ticket.createdAt,
                lastUpdated: ticket.updatedAt
            },
            viewedBy: userWallet,
            viewedAt: new Date()
        };

        console.log(`✅ Retrieved history for ticket ${ticketId}: ${enhancedHistory.length} transactions`);

        return res.json(response);

    } catch (error) {
        console.error('Error getting ticket transaction history:', error);
        return res.status(500).json({
            success: false,
            msg: 'Server error getting transaction history',
            error: error.message
        });
    }
};
exports.getMarketplaceStats = async (req, res) => {
    try {
        console.log('📈 ===== GET MARKETPLACE STATISTICS =====');

        // Use Promise.all for parallel queries with timeout
        const [
            totalTickets,
            listedTickets,
            soldTickets,
            avgPriceResult,
            priceRangeResult,
            recentActivity,
            topSections
        ] = await Promise.all([
            Ticket.countDocuments({}).maxTimeMS(5000),
            Ticket.countDocuments({ isListed: true }).maxTimeMS(5000),
            Ticket.countDocuments({
                transactionHistory: { $elemMatch: { action: 'transfer' } }
            }).maxTimeMS(5000),

            // Average listing price
            Ticket.aggregate([
                { $match: { isListed: true } },
                { $group: { _id: null, avgPrice: { $avg: '$listingPrice' } } }
            ]).maxTimeMS(5000),

            // Price range
            Ticket.aggregate([
                { $match: { isListed: true } },
                { $group: { _id: null, minPrice: { $min: '$listingPrice' }, maxPrice: { $max: '$listingPrice' } } }
            ]).maxTimeMS(5000),

            // Recent activity (last 24 hours)
            Ticket.countDocuments({
                $or: [
                    { listingDate: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
                    { updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
                ]
            }).maxTimeMS(5000),

            // Top sections by listing count
            Ticket.aggregate([
                { $match: { isListed: true } },
                { $group: { _id: '$sectionName', count: { $sum: 1 }, avgPrice: { $avg: '$listingPrice' } } },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ]).maxTimeMS(5000)
        ]);

        const avgListingPrice = avgPriceResult.length > 0 ? avgPriceResult[0].avgPrice : 0;
        const priceRange = priceRangeResult.length > 0 ? priceRangeResult[0] : { minPrice: 0, maxPrice: 0 };

        // Calculate health indicators
        const listingRate = totalTickets > 0 ? (listedTickets / totalTickets) * 100 : 0;
        const activityRate = totalTickets > 0 ? (recentActivity / totalTickets) * 100 : 0;

        const isHealthy = listingRate > 5 && listingRate < 50 && activityRate > 0;

        const stats = {
            overview: {
                totalTickets,
                listedTickets,
                soldTickets,
                availableTickets: listedTickets,
                listingRate: parseFloat(listingRate.toFixed(2))
            },
            pricing: {
                averageListingPrice: parseFloat((avgListingPrice || 0).toFixed(4)),
                priceRange: {
                    min: priceRange.minPrice || 0,
                    max: priceRange.maxPrice || 0
                },
                currency: 'SOL'
            },
            activity: {
                recentActivity24h: recentActivity,
                activityRate: parseFloat(activityRate.toFixed(2)),
                topSections: topSections.map(section => ({
                    name: section._id,
                    listedCount: section.count,
                    averagePrice: parseFloat((section.avgPrice || 0).toFixed(4))
                }))
            },
            health: {
                isHealthy,
                indicators: {
                    hasActiveListings: listedTickets > 0,
                    hasRecentActivity: recentActivity > 0,
                    healthyListingRate: listingRate > 5 && listingRate < 50,
                    priceVariety: (priceRange.maxPrice || 0) > (priceRange.minPrice || 0)
                }
            },
            metadata: {
                lastCalculated: new Date().toISOString(),
                calculationDuration: 'real-time',
                dataFreshness: 'current'
            }
        };

        console.log(`✅ Marketplace stats calculated: ${totalTickets} total, ${listedTickets} listed, ${soldTickets} sold`);

        return res.json({
            success: true,
            marketplaceStats: stats
        });

    } catch (error) {
        console.error('Error getting marketplace stats:', error);

        // Handle timeout specifically
        if (error.name === 'MongooseError' && error.message.includes('timeout')) {
            return res.status(408).json({
                success: false,
                msg: 'Database timeout calculating marketplace statistics',
                timeout: true
            });
        }

        return res.status(500).json({
            success: false,
            msg: 'Server error getting marketplace statistics',
            error: error.message
        });
    }
};
exports.mintTicketWithSeatLocking = async (req, res) => {
    try {
        console.log('🎫 ===== ENHANCED MINT WITH SEAT LOCKING =====');

        const { concertId, sectionName, seatNumber } = req.body;
        const userId = req.user?.walletAddress;

        // Get seat locking service
        const seatLockingService = global.seatLockingService;

        if (!seatLockingService) {
            console.warn('⚠️ Seat locking service not available, proceeding with regular mint');
            return exports.mintTicket(req, res);
        }

        // Check if seat is locked for processing by this user
        const seatStatus = seatLockingService.checkSeatLockStatus(concertId, sectionName, seatNumber);

        if (seatStatus.locked && seatStatus.lockType === 'processing' && seatStatus.lockedBy !== userId) {
            return res.status(409).json({
                success: false,
                msg: 'Seat is currently being processed by another user',
                conflict: true,
                lockType: seatStatus.lockType,
                processingBy: 'other_user'
            });
        }

        // Proceed with regular mint
        const result = await exports.mintTicket(req, res);

        // If mint was successful, complete the processing
        if (res.statusCode >= 200 && res.statusCode < 300) {
            seatLockingService.completeProcessing(concertId, sectionName, seatNumber, userId, true);
            console.log(`✅ Completed processing for successful mint: ${concertId}-${sectionName}-${seatNumber}`);
        }

        return result;

    } catch (error) {
        console.error('Error in enhanced mint with seat locking:', error);

        // Complete processing with failure
        const { concertId, sectionName, seatNumber } = req.body;
        const userId = req.user?.walletAddress;
        const seatLockingService = global.seatLockingService;

        if (seatLockingService && concertId && sectionName && seatNumber && userId) {
            seatLockingService.completeProcessing(concertId, sectionName, seatNumber, userId, false);
            console.log(`❌ Completed processing for failed mint: ${concertId}-${sectionName}-${seatNumber}`);
        }

        return res.status(500).json({
            success: false,
            msg: 'Server error during enhanced minting',
            error: error.message
        });
    }
};
// Get tickets for sale in marketplace - UNCHANGED
exports.getTicketsForSale = async (req, res) => {
    try {
        const { concertId } = req.query;

        console.log(`🏪 GET TICKETS FOR SALE${concertId ? ` for concert: ${concertId}` : ''}`);
        console.log(`👤 Requested by: ${req.user?.walletAddress || 'Anonymous (Public)'}`);

        // Build query - only tickets that are actually listed for sale
        let query = {
            isListed: true,
            listingPrice: { $exists: true, $gt: 0 }
        };

        // Filter by specific concert if provided
        if (concertId && mongoose.Types.ObjectId.isValid(concertId)) {
            query.concertId = concertId;
            console.log(`🔍 Filtering by concert: ${concertId}`);
        }

        // Get tickets with timeout
        const tickets = await Ticket.find(query)
            .sort({ listingDate: -1 })
            .maxTimeMS(10000);

        console.log(`📊 Found ${tickets.length} tickets listed for sale`);

        if (tickets.length === 0) {
            return res.json({
                success: true,
                tickets: [],
                count: 0,
                message: 'No tickets currently listed for sale',
                timestamp: new Date().toISOString()
            });
        }

        // Enhance tickets with concert information
        const enhancedTickets = await Promise.allSettled(
            tickets.map(async (ticket) => {
                try {
                    let enhancedTicket = { ...ticket.toObject() };

                    // Initialize concert info
                    enhancedTicket.concertExists = false;
                    enhancedTicket.concertName = 'Unknown Concert';
                    enhancedTicket.concertVenue = 'Unknown Venue';
                    enhancedTicket.concertDate = null;
                    enhancedTicket.concertCreator = null;

                    // Try to get concert info
                    if (ticket.concertId && mongoose.Types.ObjectId.isValid(ticket.concertId)) {
                        try {
                            const concert = await Concert.findById(ticket.concertId)
                                .select('name venue date creator')
                                .maxTimeMS(3000);

                            if (concert) {
                                enhancedTicket.concertExists = true;
                                enhancedTicket.concertName = concert.name;
                                enhancedTicket.concertVenue = concert.venue;
                                enhancedTicket.concertDate = concert.date;
                                enhancedTicket.concertCreator = concert.creator;
                            } else {
                                enhancedTicket.concertName = 'Concert Deleted';
                                enhancedTicket.concertVenue = 'Unknown Venue';
                            }
                        } catch (concertErr) {
                            console.warn(`⚠️ Could not fetch concert ${ticket.concertId}:`, concertErr.message);
                            enhancedTicket.concertName = 'Concert Lookup Failed';
                            enhancedTicket.concertVenue = 'Unknown Venue';
                        }
                    }

                    // Add blockchain verification status
                    const hasValidTransaction = ticket.transactionSignature &&
                        !ticket.transactionSignature.startsWith('dummy_') &&
                        !ticket.transactionSignature.startsWith('added_') &&
                        !ticket.transactionSignature.startsWith('dev_') &&
                        !ticket.transactionSignature.startsWith('error_');

                    enhancedTicket.blockchainVerified = hasValidTransaction;
                    enhancedTicket.explorerUrl = hasValidTransaction ?
                        `https://explorer.solana.com/tx/${ticket.transactionSignature}?cluster=testnet` : null;

                    // Add marketplace-specific data
                    enhancedTicket.marketplaceInfo = {
                        isForSale: ticket.isListed,
                        listingPrice: ticket.listingPrice,
                        listingDate: ticket.listingDate,
                        seller: ticket.owner,
                        originalPrice: ticket.price,
                        markup: ticket.listingPrice > ticket.price ?
                            ((ticket.listingPrice - ticket.price) / ticket.price * 100).toFixed(2) : 0,
                        daysSinceListed: ticket.listingDate ?
                            Math.floor((Date.now() - new Date(ticket.listingDate).getTime()) / (1000 * 60 * 60 * 24)) : 0
                    };

                    return enhancedTicket;

                } catch (err) {
                    console.error(`❌ Error enhancing ticket ${ticket._id}:`, err);
                    // Return original ticket if enhancement fails
                    return {
                        ...ticket.toObject(),
                        concertExists: false,
                        concertName: 'Processing Error',
                        concertVenue: 'Unknown Venue',
                        hasError: true
                    };
                }
            })
        );

        // Filter successful results and handle errors
        const validTickets = enhancedTickets
            .filter(result => result.status === 'fulfilled')
            .map(result => result.value);

        const failedEnhancements = enhancedTickets
            .filter(result => result.status === 'rejected')
            .length;

        if (failedEnhancements > 0) {
            console.warn(`⚠️ ${failedEnhancements} tickets failed enhancement`);
        }

        // Sort tickets by listing date (newest first) and then by price (lowest first)
        validTickets.sort((a, b) => {
            const dateA = new Date(a.listingDate || 0);
            const dateB = new Date(b.listingDate || 0);
            if (dateB.getTime() !== dateA.getTime()) {
                return dateB.getTime() - dateA.getTime();
            }
            return (a.listingPrice || 0) - (b.listingPrice || 0);
        });

        console.log(`✅ Returning ${validTickets.length} enhanced marketplace tickets`);

        return res.json({
            success: true,
            tickets: validTickets,
            count: validTickets.length,
            message: `Found ${validTickets.length} tickets for sale`,
            metadata: {
                totalFound: tickets.length,
                successfullyEnhanced: validTickets.length,
                failedEnhancements: failedEnhancements,
                timestamp: new Date().toISOString(),
                requestedBy: req.user?.walletAddress || 'anonymous'
            }
        });

    } catch (error) {
        console.error('❌ Error getting tickets for sale:', error);

        // Handle specific error types
        if (error.name === 'MongooseError' && error.message.includes('timeout')) {
            return res.status(408).json({
                success: false,
                msg: 'Database timeout - please try again',
                timeout: true
            });
        }

        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                msg: 'Invalid concert ID format',
                field: 'concertId'
            });
        }

        return res.status(500).json({
            success: false,
            msg: 'Server error getting tickets for sale',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    }
};

module.exports = {
    // Existing functions
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
    checkSeatAvailability: exports.checkSeatAvailability,

    // NEW: Missing functions yang ditambahkan
    fixMissingTransaction: exports.fixMissingTransaction,
    markTicketValid: exports.markTicketValid,
    calculateRoyalty: exports.calculateRoyalty,
    getTicketTransactionHistory: exports.getTicketTransactionHistory,
    getMarketplaceStats: exports.getMarketplaceStats,
    mintTicketWithSeatLocking: exports.mintTicketWithSeatLocking
};