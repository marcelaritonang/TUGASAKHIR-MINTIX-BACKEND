//models/Concert.js 
const mongoose = require('mongoose');

const ConcertSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    venue: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    description: {
        type: String
    },
    category: {
        type: String
    },
    posterUrl: {
        type: String
    },
    creator: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'info_requested'],
        default: 'pending'
    },
    sections: [
        {
            name: {
                type: String,
                required: true
            },
            price: {
                type: Number,
                required: true
            },
            totalSeats: {
                type: Number,
                required: true
            },
            availableSeats: {
                type: Number,
                required: true
            }
        }
    ],
    totalTickets: {
        type: Number,
        required: true
    },
    ticketsSold: {
        type: Number,
        default: 0
    },
    approvalHistory: [
        {
            action: {
                type: String,
                enum: ['approve', 'reject', 'request_info']
            },
            admin: {
                type: String
            },
            message: {
                type: String
            },
            timestamp: {
                type: Date,
                default: Date.now
            }
        }
    ],
    additionalInfo: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Concert', ConcertSchema);