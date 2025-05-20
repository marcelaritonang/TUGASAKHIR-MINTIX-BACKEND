// controllers/blockchainController.js
const Ticket = require('../models/Ticket');
const blockchainService = require('../services/blockchain');

// Verifikasi transaksi blockchain
exports.verifyTransaction = async (req, res) => {
    try {
        const { signature } = req.body;

        if (!signature) {
            return res.status(400).json({ msg: 'Transaction signature required' });
        }

        // Skip jika signature dengan format yang tidak valid
        if (signature.startsWith('dummy_') ||
            signature.startsWith('added_') ||
            signature.startsWith('error_')) {
            return res.status(400).json({
                success: false,
                exists: false,
                valid: false,
                msg: 'Invalid transaction signature format'
            });
        }

        // Verifikasi transaksi di blockchain
        const isValid = await blockchainService.isTransactionValid(signature);
        const isSolTransfer = await blockchainService.isSolTransfer(signature);

        res.json({
            success: true,
            exists: isValid,
            valid: isValid && isSolTransfer,
            isSolTransfer
        });
    } catch (err) {
        console.error('Error verifying transaction:', err);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// Dapatkan info transaksi dari blockchain
exports.getTransactionInfo = async (req, res) => {
    try {
        const { signature } = req.params;

        if (!signature) {
            return res.status(400).json({ msg: 'Transaction signature required' });
        }

        // Skip jika signature dengan format yang tidak valid
        if (signature.startsWith('dummy_') ||
            signature.startsWith('added_') ||
            signature.startsWith('error_')) {
            return res.status(400).json({
                exists: false,
                valid: false,
                msg: 'Invalid transaction signature format'
            });
        }

        try {
            // Ambil data transaksi dari blockchain
            const txData = await blockchainService.getTxData(signature);

            if (!txData) {
                return res.json({ exists: false });
            }

            // Ekstrak data penting
            const blockTime = txData.blockTime ? new Date(txData.blockTime * 1000) : null;
            const slot = txData.slot;
            const confirmations = txData.confirmations || 'finalized';
            let fee = 0;
            let from = '';
            let to = '';
            let amount = 0;

            // Coba ekstrak data detail transaksi
            if (txData.meta && txData.transaction) {
                fee = txData.meta.fee / 1_000_000_000; // Convert lamports ke SOL

                const accountKeys = txData.transaction.message.accountKeys;
                if (accountKeys.length > 0) {
                    from = accountKeys[0].toString();
                }

                if (accountKeys.length > 1) {
                    to = accountKeys[1].toString();
                }

                // Coba hitung jumlah transfer dari perubahan balance
                if (txData.meta.preBalances && txData.meta.postBalances && accountKeys.length > 1) {
                    const preBalance = txData.meta.preBalances[0];
                    const postBalance = txData.meta.postBalances[0];
                    const transferFee = txData.meta.fee || 0;

                    // Value in SOL
                    amount = (preBalance - postBalance - transferFee) / 1_000_000_000;
                }
            }

            const result = {
                exists: true,
                status: txData.meta?.err ? 'failed' : 'confirmed',
                blockTime,
                slot,
                confirmations,
                fee,
                from,
                to,
                value: parseFloat(amount.toFixed(9))
            };

            return res.json(result);
        } catch (txError) {
            console.error(`Error fetching tx data for ${signature}:`, txError);
            return res.status(500).json({ msg: 'Error fetching transaction data', error: txError.message });
        }
    } catch (err) {
        console.error('Error in getTransactionInfo:', err);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// Update tiket dengan transaksi blockchain nyata
exports.updateTicketTransaction = async (req, res) => {
    try {
        const { ticketId, transactionSignature } = req.body;

        if (!ticketId || !transactionSignature) {
            return res.status(400).json({ msg: 'Ticket ID and transaction signature are required' });
        }

        // Skip jika signature dengan format yang tidak valid
        if (transactionSignature.startsWith('dummy_') ||
            transactionSignature.startsWith('added_') ||
            transactionSignature.startsWith('error_')) {
            return res.status(400).json({ msg: 'Invalid transaction signature format' });
        }

        // Cari tiket
        const ticket = await Ticket.findById(ticketId);

        if (!ticket) {
            return res.status(404).json({ msg: 'Ticket not found' });
        }

        // Pastikan user adalah pemilik tiket
        if (ticket.owner !== req.user.walletAddress) {
            return res.status(401).json({ msg: 'Not authorized to update this ticket' });
        }

        // Verifikasi transaksi
        const isValid = await blockchainService.isTransactionValid(transactionSignature);
        if (!isValid) {
            return res.status(400).json({ msg: 'Invalid transaction signature' });
        }

        // Verifikasi jenis transaksi (transfer SOL)
        const isSolTransfer = await blockchainService.isSolTransfer(transactionSignature);
        if (!isSolTransfer) {
            return res.status(400).json({ msg: 'Transaction is not a valid SOL transfer' });
        }

        // Update tiket
        ticket.transactionSignature = transactionSignature;

        // Tambahkan ke history transaksi
        ticket.transactionHistory.push({
            action: 'update_transaction',
            from: req.user.walletAddress,
            timestamp: Date.now(),
            transactionSignature: transactionSignature
        });

        await ticket.save();

        res.json({
            success: true,
            msg: 'Ticket transaction updated successfully',
            ticket
        });
    } catch (err) {
        console.error('Error updating ticket transaction:', err);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};

// Membuat transaksi blockchain untuk tiket
exports.createTicketTransaction = async (req, res) => {
    try {
        const { ticketId, transactionSignature } = req.body;

        if (!ticketId || !transactionSignature) {
            return res.status(400).json({ msg: 'Ticket ID and transaction signature are required' });
        }

        // Cari tiket
        const ticket = await Ticket.findById(ticketId);

        if (!ticket) {
            return res.status(404).json({ msg: 'Ticket not found' });
        }

        // Pastikan user adalah pemilik tiket
        if (ticket.owner !== req.user.walletAddress) {
            return res.status(401).json({ msg: 'Not authorized to update this ticket' });
        }

        // Verifikasi transaksi baru
        try {
            const isValid = await blockchainService.isTransactionValid(transactionSignature);
            if (!isValid) {
                return res.status(400).json({ msg: 'Invalid transaction signature' });
            }

            const isSolTransfer = await blockchainService.isSolTransfer(transactionSignature);
            if (!isSolTransfer) {
                return res.status(400).json({ msg: 'Transaction is not a valid SOL transfer' });
            }
        } catch (verifyErr) {
            return res.status(400).json({ msg: 'Error verifying transaction: ' + verifyErr.message });
        }

        // Update tiket
        ticket.transactionSignature = transactionSignature;
        ticket.transactionHistory.push({
            action: 'create_transaction',
            from: req.user.walletAddress,
            timestamp: Date.now(),
            transactionSignature: transactionSignature
        });

        await ticket.save();

        res.json({
            success: true,
            msg: 'Ticket blockchain transaction created successfully',
            ticket
        });
    } catch (err) {
        console.error('Error creating ticket transaction:', err);
        res.status(500).json({ msg: 'Server error', error: err.message });
    }
};