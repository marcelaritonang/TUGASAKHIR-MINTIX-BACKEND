//models/Ticket.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TransactionSchema = new Schema({
    action: {
        type: String,
        enum: ['mint', 'transfer', 'use'],
        required: true
    },
    from: String,
    to: String,
    timestamp: {
        type: Date,
        default: Date.now
    },
    transactionSignature: String
});

const TicketSchema = new Schema({
    concertId: {
        type: Schema.Types.ObjectId,
        ref: 'Concert',
        required: true
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
        required: true
    },
    status: {
        type: String,
        enum: ['minted', 'transferred', 'used', 'refunded'],
        default: 'minted'
    },
    seatNumber: String,
    mintAddress: String,
    mintSignature: String,
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    transactionHistory: [TransactionSchema]
});

module.exports = mongoose.model('Ticket', TicketSchema);