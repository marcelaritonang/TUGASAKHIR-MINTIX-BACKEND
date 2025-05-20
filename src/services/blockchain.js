// backend/src/services/blockchain.js - ENHANCED VERSION
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { Program, AnchorProvider, web3, BN } = require('@project-serum/anchor');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class BlockchainService {
    constructor() {
        // Enhanced RPC URL configuration with fallbacks
        const rpcUrls = [
            process.env.SOLANA_RPC_URL,
            'https://api.testnet.solana.com',
            'https://testnet.solana.com',
            'https://rpc.ankr.com/solana_testnet',
            'https://solana-testnet.g.alchemy.com/v2/demo'
        ].filter(Boolean);

        // Initialize connection with retry mechanism
        this.initializeConnection(rpcUrls);

        // Enhanced cache and configuration
        this.transactionCache = new Map();
        this.MAX_CACHE_SIZE = 1000;
        this.CONFIRMATION_TIMEOUT = 60000; // 60 seconds
        this.MAX_RETRIES = 3;

        // Transaction validation settings
        this.validationSettings = {
            requireSolTransfer: true,
            minAmount: 0.001, // Minimum 0.001 SOL transfer
            maxConfirmationTime: 60000 // 60 seconds max wait
        };

        console.log(`Blockchain service initialized with enhanced features`);
        this.testConnection();
    }

    // Initialize connection with failover
    async initializeConnection(rpcUrls) {
        for (const rpcUrl of rpcUrls) {
            try {
                this.connection = new Connection(rpcUrl, {
                    commitment: 'confirmed',
                    disableRetryOnRateLimit: false,
                    confirmTransactionInitialTimeout: this.CONFIRMATION_TIMEOUT,
                    wsEndpoint: rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://'),
                });

                this.rpcUrl = rpcUrl;
                console.log(`Successfully connected to RPC: ${rpcUrl}`);

                // Test the connection
                const version = await Promise.race([
                    this.connection.getVersion(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Connection timeout')), 10000)
                    )
                ]);

                console.log(`Connected to Solana network version:`, version);
                return;
            } catch (err) {
                console.warn(`Failed to connect to ${rpcUrl}:`, err.message);
                continue;
            }
        }

        // Fallback to default if all fail
        this.rpcUrl = 'https://api.testnet.solana.com';
        this.connection = new Connection(this.rpcUrl, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: this.CONFIRMATION_TIMEOUT
        });
        console.log('Using fallback RPC connection');
    }

    // Enhanced connection test
    async testConnection() {
        try {
            const startTime = Date.now();
            const version = await Promise.race([
                this.connection.getVersion(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Connection timeout')), 10000)
                )
            ]);

            const responseTime = Date.now() - startTime;
            console.log(`✅ Connection test successful - Response time: ${responseTime}ms`);
            console.log(`Network version:`, version);
            return true;
        } catch (err) {
            console.error('❌ Connection test failed:', err.message);

            // Try to reinitialize with different RPC
            if (err.message.includes('timeout')) {
                console.log('Attempting to switch RPC due to timeout...');
                await this.switchToBackupRPC();
            }

            return false;
        }
    }

    // Switch to backup RPC if primary fails
    async switchToBackupRPC() {
        const backupRpcs = [
            'https://api.testnet.solana.com',
            'https://testnet.solana.com',
            'https://rpc.ankr.com/solana_testnet'
        ].filter(url => url !== this.rpcUrl);

        for (const rpcUrl of backupRpcs) {
            try {
                console.log(`Switching to backup RPC: ${rpcUrl}`);
                this.connection = new Connection(rpcUrl, {
                    commitment: 'confirmed',
                    confirmTransactionInitialTimeout: this.CONFIRMATION_TIMEOUT
                });

                await this.connection.getVersion();
                this.rpcUrl = rpcUrl;
                console.log(`✅ Successfully switched to: ${rpcUrl}`);
                return true;
            } catch (err) {
                console.log(`❌ Backup RPC ${rpcUrl} also failed`);
                continue;
            }
        }

        console.error('All backup RPCs failed');
        return false;
    }

    // Enhanced transaction retrieval with retry and caching
    async getTxData(signature, retries = 0) {
        try {
            // Return null for invalid signatures
            if (this.isInvalidSignature(signature)) {
                return null;
            }

            // Check cache first
            const cacheKey = `tx_${signature}`;
            if (this.transactionCache.has(cacheKey)) {
                const cached = this.transactionCache.get(cacheKey);
                // Use cache if less than 10 minutes old for confirmed transactions
                if (Date.now() - cached.timestamp < 600000) {
                    console.log(`📂 Using cached transaction data for ${signature}`);
                    return cached.data;
                }
            }

            console.log(`🔍 Fetching transaction: ${signature} (attempt ${retries + 1})`);

            // Set timeout and retry on failure
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Transaction fetch timeout')), 15000)
            );

            const fetchPromise = this.connection.getTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
            });

            const txData = await Promise.race([fetchPromise, timeoutPromise]);

            if (txData) {
                // Cache successful result
                this._addToCache(cacheKey, {
                    data: txData,
                    timestamp: Date.now()
                });
                console.log(`✅ Transaction found: ${signature}`);
                return txData;
            }

            // Transaction not found
            console.log(`⚠️ Transaction not found: ${signature}`);
            return null;

        } catch (err) {
            console.error(`❌ Error fetching transaction ${signature}:`, err.message);

            // Retry on timeout or connection errors
            if (retries < this.MAX_RETRIES &&
                (err.message.includes('timeout') || err.message.includes('fetch'))) {

                const delay = Math.pow(2, retries) * 1000; // Exponential backoff
                console.log(`🔄 Retrying in ${delay}ms...`);

                await new Promise(resolve => setTimeout(resolve, delay));
                return this.getTxData(signature, retries + 1);
            }

            throw err;
        }
    }

    // Check if signature format is invalid
    isInvalidSignature(signature) {
        if (!signature || typeof signature !== 'string') return true;

        return signature.startsWith('dummy_') ||
            signature.startsWith('added_') ||
            signature.startsWith('error_') ||
            signature.length < 64; // Solana signatures are typically 87-88 characters
    }

    // Enhanced transaction validation with comprehensive checks
    async isTransactionValid(signature) {
        try {
            if (this.isInvalidSignature(signature)) {
                console.log(`❌ Invalid signature format: ${signature}`);
                return false;
            }

            const txData = await this.getTxData(signature);
            if (!txData) {
                console.log(`❌ Transaction not found: ${signature}`);
                return false;
            }

            // Check if transaction succeeded (no errors)
            const hasNoErrors = !txData.meta?.err;
            if (!hasNoErrors) {
                console.log(`❌ Transaction failed with error:`, txData.meta.err);
                return false;
            }

            // Check if transaction is confirmed
            const slot = txData.slot;
            if (!slot) {
                console.log(`❌ Transaction not confirmed: ${signature}`);
                return false;
            }

            console.log(`✅ Transaction valid: ${signature}`);
            return true;

        } catch (err) {
            console.error(`❌ Error validating transaction ${signature}:`, err.message);
            return false;
        }
    }

    // Enhanced SOL transfer validation with amount and recipient checks
    async isSolTransfer(signature, expectedAmount = null, expectedRecipient = null) {
        try {
            if (this.isInvalidSignature(signature)) {
                return false;
            }

            const txData = await this.getTxData(signature);
            if (!txData || !txData.meta || !txData.transaction) {
                return false;
            }

            // Check for balance changes (primary indicator of SOL transfer)
            if (txData.meta.preBalances && txData.meta.postBalances) {
                const balanceChanges = this.analyzeBalanceChanges(txData);

                if (balanceChanges.hasChanges) {
                    console.log(`✅ SOL transfer detected: ${balanceChanges.amount} SOL`);

                    // Validate amount if expected amount provided
                    if (expectedAmount !== null) {
                        const tolerance = 0.005; // 0.005 SOL tolerance for fees
                        const amountMatch = Math.abs(balanceChanges.amount - expectedAmount) <= tolerance;

                        if (!amountMatch) {
                            console.log(`❌ Amount mismatch: expected ${expectedAmount}, got ${balanceChanges.amount}`);
                            return false;
                        }
                    }

                    // Validate recipient if provided
                    if (expectedRecipient !== null) {
                        const recipientMatch = balanceChanges.recipient === expectedRecipient;

                        if (!recipientMatch) {
                            console.log(`❌ Recipient mismatch: expected ${expectedRecipient}, got ${balanceChanges.recipient}`);
                            return false;
                        }
                    }

                    return true;
                }
            }

            // Secondary check: System Program instructions
            const hasSystemTransfer = this.hasSystemProgramTransfer(txData);
            if (hasSystemTransfer) {
                console.log(`✅ System Program transfer detected: ${signature}`);
                return true;
            }

            console.log(`❌ Not a SOL transfer: ${signature}`);
            return false;

        } catch (err) {
            console.error(`❌ Error checking SOL transfer for ${signature}:`, err.message);
            // Be permissive on errors during validation
            return true;
        }
    }

    // Analyze balance changes to extract transfer details
    analyzeBalanceChanges(txData) {
        const preBalances = txData.meta.preBalances;
        const postBalances = txData.meta.postBalances;
        const accountKeys = txData.transaction.message.accountKeys;

        let hasChanges = false;
        let amount = 0;
        let sender = '';
        let recipient = '';

        for (let i = 0; i < preBalances.length; i++) {
            const balanceChange = postBalances[i] - preBalances[i];

            if (balanceChange < 0) {
                // This account lost SOL (sender)
                sender = accountKeys[i].toString();
                amount = Math.abs(balanceChange) / 1e9; // Convert lamports to SOL
                hasChanges = true;
            } else if (balanceChange > 0) {
                // This account gained SOL (recipient)
                recipient = accountKeys[i].toString();
            }
        }

        return {
            hasChanges,
            amount,
            sender,
            recipient
        };
    }

    // Check for System Program transfer instructions
    hasSystemProgramTransfer(txData) {
        const instructions = txData.transaction.message.instructions;
        const systemProgramId = '11111111111111111111111111111111';

        return instructions.some(ix => {
            return ix.programId?.toString() === systemProgramId ||
                (ix.programIdIndex !== undefined &&
                    txData.transaction.message.accountKeys[ix.programIdIndex]?.toString() === systemProgramId);
        });
    }

    // Enhanced transaction details with better extraction
    async getTransactionDetails(signature) {
        try {
            if (this.isInvalidSignature(signature)) {
                return {
                    exists: false,
                    valid: false,
                    message: 'Invalid transaction signature format'
                };
            }

            const txData = await this.getTxData(signature);
            if (!txData) {
                return {
                    exists: false,
                    message: 'Transaction not found on blockchain'
                };
            }

            // Basic transaction info
            const isValid = !txData.meta?.err;
            const blockTime = txData.blockTime ? new Date(txData.blockTime * 1000) : null;
            const slot = txData.slot;
            const fee = txData.meta?.fee ? txData.meta.fee / 1e9 : 0;

            // Analyze balance changes for transfer details
            const balanceAnalysis = this.analyzeBalanceChanges(txData);

            // Extract account information
            const accountKeys = txData.transaction.message.accountKeys;
            const from = balanceAnalysis.sender || (accountKeys.length > 0 ? accountKeys[0].toString() : '');
            const to = balanceAnalysis.recipient || (accountKeys.length > 1 ? accountKeys[1].toString() : '');

            return {
                exists: true,
                valid: isValid,
                status: isValid ? 'success' : 'failed',
                blockTime,
                slot,
                confirmations: 'confirmed', // All fetched transactions are confirmed
                fee,
                from,
                to,
                value: balanceAnalysis.amount || 0,
                signature,
                meta: txData.meta,
                isSolTransfer: await this.isSolTransfer(signature)
            };

        } catch (err) {
            console.error(`❌ Error getting transaction details for ${signature}:`, err.message);
            return {
                exists: false,
                error: err.message
            };
        }
    }

    // Enhanced SOL balance retrieval with retry
    async getSolBalance(walletAddress) {
        try {
            const pubkey = new PublicKey(walletAddress);

            const balancePromise = this.connection.getBalance(pubkey);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Balance fetch timeout')), 10000)
            );

            const balance = await Promise.race([balancePromise, timeoutPromise]);
            return balance / 1e9; // Convert lamports to SOL

        } catch (err) {
            console.error(`❌ Error getting balance for ${walletAddress}:`, err.message);

            // Retry once with backup RPC
            try {
                await this.switchToBackupRPC();
                const pubkey = new PublicKey(walletAddress);
                const balance = await this.connection.getBalance(pubkey);
                return balance / 1e9;
            } catch (retryErr) {
                console.error(`❌ Retry also failed:`, retryErr.message);
                return 0;
            }
        }
    }

    /**
 * Verifikasi transaksi marketplace untuk pembelian tiket
 * @param {string} signature - Signature transaksi Solana
 * @param {string} expectedSeller - Alamat wallet penjual yang seharusnya menerima pembayaran
 * @param {number} expectedPrice - Harga dalam SOL yang seharusnya dibayarkan
 * @param {number} tolerance - Toleransi perbedaan harga (default 0.005 SOL)
 * @returns {Promise<Object>} Hasil verifikasi
 */
    async verifyMarketplaceTransaction(signature, expectedSeller, expectedPrice, tolerance = 0.005) {
        try {
            console.log(`🔍 Verifying marketplace transaction: ${signature}`);
            console.log(`Expected seller: ${expectedSeller}`);
            console.log(`Expected price: ${expectedPrice} SOL`);

            // Skip invalid signature formats
            if (this.isInvalidSignature(signature)) {
                return {
                    success: false,
                    error: 'Invalid transaction signature format',
                    checks: { valid: false }
                };
            }

            // Tingkatkan timeout untuk pemrosesan
            const transactionDataPromise = this.getTxData(signature);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Verification timeout')), 15000)
            );

            // Get transaction data with timeout
            let txData;
            try {
                txData = await Promise.race([transactionDataPromise, timeoutPromise]);
            } catch (timeoutErr) {
                console.log('Transaction fetch timeout, retrying with extended timeout');
                try {
                    // Retry with extended timeout
                    txData = await this.getTxData(signature);
                } catch (retryErr) {
                    return {
                        success: false,
                        error: 'Failed to retrieve transaction data after retry',
                        details: retryErr.message
                    };
                }
            }

            // Periksa apakah transaksi ditemukan
            if (!txData) {
                return {
                    success: false,
                    error: 'Transaction not found on the blockchain',
                    checks: { found: false }
                };
            }

            // Periksa apakah transaksi berhasil (tidak ada error)
            if (txData.meta?.err) {
                return {
                    success: false,
                    error: 'Transaction failed on the blockchain',
                    details: txData.meta.err,
                    checks: { found: true, valid: false }
                };
            }

            // Analisis perubahan saldo untuk mendeteksi transfer SOL
            const balanceChanges = this.analyzeBalanceChanges(txData);

            if (!balanceChanges.hasChanges) {
                return {
                    success: false,
                    error: 'No SOL transfers detected in transaction',
                    checks: { found: true, valid: true, transfer: false }
                };
            }

            // Periksa penerima transfer (penjual)
            const recipientCheck = balanceChanges.recipient === expectedSeller;
            if (!recipientCheck) {
                return {
                    success: false,
                    error: 'Transfer recipient does not match expected seller',
                    expected: expectedSeller,
                    actual: balanceChanges.recipient,
                    checks: { found: true, valid: true, transfer: true, recipient: false }
                };
            }

            // Periksa jumlah transfer (harga)
            const amountCheck = Math.abs(balanceChanges.amount - expectedPrice) <= tolerance;
            if (!amountCheck) {
                return {
                    success: false,
                    error: 'Transfer amount does not match expected price',
                    expected: expectedPrice,
                    actual: balanceChanges.amount,
                    tolerance,
                    checks: { found: true, valid: true, transfer: true, recipient: true, amount: false }
                };
            }

            // Semua pemeriksaan berhasil
            return {
                success: true,
                details: {
                    signature,
                    amount: balanceChanges.amount,
                    sender: balanceChanges.sender,
                    recipient: balanceChanges.recipient,
                    timestamp: txData.blockTime ? new Date(txData.blockTime * 1000) : new Date(),
                    slot: txData.slot
                },
                checks: { found: true, valid: true, transfer: true, recipient: true, amount: true }
            };
        } catch (err) {
            console.error(`❌ Error verifying marketplace transaction:`, err);

            // Skip verification untuk mode development
            if (process.env.NODE_ENV !== 'production') {
                console.log('⚠️ Development mode: Accepting transaction without full verification');
                return {
                    success: true,
                    warning: 'Accepted without full verification (DEVELOPMENT MODE ONLY)',
                    details: {
                        signature,
                        isDevelopmentMode: true
                    }
                };
            }

            return {
                success: false,
                error: err.message || 'Unknown verification error',
                details: err
            };
        }
    }

    // Poll transaction status until confirmed
    async pollTransactionUntilConfirmed(signature, maxAttempts = 12, delayMs = 5000) {
        if (this.isInvalidSignature(signature)) {
            return {
                confirmed: false,
                error: 'Invalid signature format'
            };
        }

        console.log(`🔄 Polling transaction ${signature} for confirmation...`);

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const isValid = await this.isTransactionValid(signature);

                if (isValid) {
                    console.log(`✅ Transaction confirmed after ${attempt} attempts`);
                    return {
                        confirmed: true,
                        attempts: attempt,
                        transaction: await this.getTransactionDetails(signature)
                    };
                }

                if (attempt < maxAttempts) {
                    console.log(`⏳ Attempt ${attempt}/${maxAttempts} - waiting ${delayMs}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }

            } catch (err) {
                console.error(`❌ Error on attempt ${attempt}:`, err.message);

                if (attempt < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
        }

        console.log(`❌ Transaction not confirmed after ${maxAttempts} attempts`);
        return {
            confirmed: false,
            attempts: maxAttempts,
            error: 'Transaction not confirmed within timeout period'
        };
    }

    // Cache management
    _addToCache(key, value) {
        // Implement LRU cache eviction
        if (this.transactionCache.size >= this.MAX_CACHE_SIZE) {
            const oldestKey = this.transactionCache.keys().next().value;
            this.transactionCache.delete(oldestKey);
        }

        this.transactionCache.set(key, value);
    }

    // Clear cache
    clearCache() {
        this.transactionCache.clear();
        console.log('🧹 Cache cleared');
    }

    // Health check
    async healthCheck() {
        try {
            const startTime = Date.now();
            const version = await this.connection.getVersion();
            const responseTime = Date.now() - startTime;

            return {
                status: 'healthy',
                rpcUrl: this.rpcUrl,
                responseTime: `${responseTime}ms`,
                version,
                cacheSize: this.transactionCache.size
            };
        } catch (err) {
            return {
                status: 'unhealthy',
                error: err.message,
                rpcUrl: this.rpcUrl
            };
        }
    }
}

// Export singleton instance
const blockchainService = new BlockchainService();
module.exports = blockchainService;