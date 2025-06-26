// models/Ticket.js - FIXED VERSION with proper indexing
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TransactionSchema = new Schema({
    action: {
        type: String,
        enum: ['mint', 'transfer', 'use', 'update_transaction', 'create_transaction', 'list_for_sale', 'cancel_listing'],
        required: true
    },
    from: String,
    to: String,
    timestamp: {
        type: Date,
        default: Date.now
    },
    transactionSignature: String,
    mintAddress: String,
    ticketAddress: String,
    tokenAccountAddress: String,
    price: Number,
    metadata: Schema.Types.Mixed
});

const TicketSchema = new Schema({
    concertId: {
        type: Schema.Types.ObjectId,
        ref: 'Concert',
        required: true,
        index: true
    },
    sectionName: {
        type: String,
        required: true
    },
    seatNumber: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    owner: {
        type: String,
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['minted', 'transferred', 'used', 'refunded'],
        default: 'minted'
    },

    // Blockchain information - ENHANCED
    transactionSignature: {
        type: String,
        index: true
    },
    mintAddress: String,
    ticketAddress: String,
    tokenAccountAddress: String,
    concertAddress: String,

    // Enhanced metadata for blockchain info
    metadata: {
        qrCode: String,
        qrCodeUrl: String,
        ticketDesign: String,
        specialAttributes: [String],
        tier: String,
        blockchainNetwork: {
            type: String,
            default: 'solana-testnet'
        }
    },

    // Security hash for verification
    securityHash: String,

    // Flag untuk tiket dengan konser yang hilang
    hasMissingConcert: {
        type: Boolean,
        default: false
    },

    // Flag untuk verifikasi
    isVerified: {
        type: Boolean,
        default: false
    },
    verifiedAt: Date,
    verifiedBy: String,

    // Secondary market fields
    listingPrice: {
        type: Number,
        default: 0
    },
    isListed: {
        type: Boolean,
        default: false
    },
    listingDate: Date,
    isPrimary: {
        type: Boolean,
        default: true
    },
    paymentRecipient: String,
    previousOwners: [{
        address: String,
        fromDate: Date,
        toDate: Date,
        transactionSignature: String,
        salePrice: Number
    }],

    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },

    // History transaksi
    transactionHistory: [TransactionSchema]
});

// CRITICAL: Add compound unique index to prevent duplicate seats
TicketSchema.index({
    concertId: 1,
    sectionName: 1,
    seatNumber: 1
}, {
    unique: true,
    name: 'unique_seat_per_concert'
});

// Additional useful indexes
TicketSchema.index({ owner: 1, status: 1 });
TicketSchema.index({ isListed: 1, listingPrice: 1 });
TicketSchema.index({ transactionSignature: 1 }, { sparse: true });

// Pre-save hook untuk update timestamp
TicketSchema.pre('save', function (next) {
    this.updatedAt = Date.now();

    // Generate security hash if not exists
    if (!this.securityHash) {
        this.securityHash = `sec_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }

    next();
});

// Virtual for QR code data
TicketSchema.virtual('qrCodeData').get(function () {
    return {
        ticketId: this._id,
        concertId: this.concertId,
        sectionName: this.sectionName,
        seatNumber: this.seatNumber,
        owner: this.owner,
        transactionSignature: this.transactionSignature,
        mintAddress: this.mintAddress,
        securityHash: this.securityHash
    };
});

// Ensure virtual fields are serialized
TicketSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Ticket', TicketSchema);