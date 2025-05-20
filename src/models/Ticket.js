// models/Ticket.js
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
    price: Number
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
    seatNumber: String,
    // Kolom untuk data blockchain
    transactionSignature: {
        type: String,
        index: true
    },  // Tanda tangan transaksi Solana (SOL transfer atau smart contract)
    mintAddress: String,           // Alamat mint NFT
    ticketAddress: String,         // Alamat akun tiket di blockchain
    tokenAccountAddress: String,   // Alamat token account
    concertAddress: String,        // Alamat akun konser di blockchain

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
    verifiedAt: {
        type: Date
    },

    // Secondary market fields - BARU
    listingPrice: {
        type: Number,
        default: 0
    },
    isListed: {
        type: Boolean,
        default: false
    },
    listingDate: {
        type: Date
    },
    isPrimary: {
        type: Boolean,
        default: true // True if primary market (minted directly), false if secondary (resold)
    },
    paymentRecipient: {
        type: String // Record who received the payment (creator or reseller)
    },
    previousOwners: [{
        address: String,
        fromDate: Date,
        toDate: Date,
        transactionSignature: String
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

// Pre-save hook untuk update timestamp
TicketSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Ticket', TicketSchema);