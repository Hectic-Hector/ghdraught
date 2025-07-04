/**
 * AI Controller - Main Thread Interface for Grandmaster AI
 * Manages Web Worker for non-blocking AI computation
 * @author codewithheck
 * Grandmaster Edition
 */

export class AIController {
    constructor() {
        this.worker = null;
        this.pendingRequests = new Map();
        this.requestId = 0;
        this.initialized = false;
        this.initPromise = null;
    }

    /**
     * Initialize the AI worker and wait for it to be ready
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.initPromise) return this.initPromise;
        
        this.initPromise = new Promise((resolve, reject) => {
            try {
                // Create the worker
                this.worker = new Worker('src/engine/ai/ai.worker.js', { type: 'module' });
                
                // Set up message handler
                this.worker.onmessage = (event) => {
                    const { type, requestId, data, error } = event.data;
                    
                    if (type === 'initialized') {
                        this.initialized = true;
                        console.log('AI Worker initialized successfully');
                        resolve();
                    } else if (type === 'moveResult' && this.pendingRequests.has(requestId)) {
                        const { resolve, reject } = this.pendingRequests.get(requestId);
                        this.pendingRequests.delete(requestId);
                        
                        if (error) {
                            reject(new Error(error));
                        } else {
                            resolve(data.move);
                        }
                    } else if (type === 'evaluation') {
                        // Handle evaluation updates for UI display
                        if (window.gameController && window.gameController.ui) {
                            window.gameController.ui.updateAnalysis(data);
                        }
                    } else if (type === 'log') {
                        console.log('[AI Worker]:', data.message);
                    }
                };
                
                // Set up error handler
                this.worker.onerror = (error) => {
                    console.error('AI Worker error:', error);
                    this.initialized = false;
                    reject(error);
                };
                
                // Initialize the worker
                this.worker.postMessage({ type: 'initialize' });
                
            } catch (error) {
                console.error('Failed to create AI Worker:', error);
                reject(error);
            }
        });
        
        return this.initPromise;
    }

    /**
     * Set the AI difficulty level
     * @param {number} level - Difficulty level (1-6)
     */
    async setDifficulty(level) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        this.worker.postMessage({
            type: 'setDifficulty',
            data: { level }
        });
    }

    /**
     * Get the best move for the current position
     * @param {Object} position - Current game position
     * @param {string[]} moveHistoryNotations - Move history in notation format
     * @returns {Promise<Object>} Best move
     */
    async getMove(position, moveHistoryNotations) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        const requestId = ++this.requestId;
        
        return new Promise((resolve, reject) => {
            // Store the promise callbacks
            this.pendingRequests.set(requestId, { resolve, reject });
            
            // Set a timeout
            const timeout = setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error('AI move calculation timed out'));
                }
            }, 30000); // 30 second timeout
            
            // Send the request to the worker
            this.worker.postMessage({
                type: 'getMove',
                requestId,
                data: {
                    position: {
                        pieces: position.pieces,
                        currentPlayer: position.currentPlayer
                    },
                    moveHistoryNotations
                }
            });
            
            // Clear timeout on resolution
            this.pendingRequests.get(requestId).clearTimeout = () => clearTimeout(timeout);
        });
    }

    /**
     * Abort the current search
     */
    abortSearch() {
        if (this.worker) {
            this.worker.postMessage({ type: 'abort' });
            
            // Reject all pending requests
            this.pendingRequests.forEach(({ reject, clearTimeout }) => {
                if (clearTimeout) clearTimeout();
                reject(new Error('Search aborted'));
            });
            this.pendingRequests.clear();
        }
    }

    /**
     * Terminate the worker and clean up resources
     */
    terminate() {
        if (this.worker) {
            this.abortSearch();
            this.worker.terminate();
            this.worker = null;
            this.initialized = false;
            this.initPromise = null;
        }
    }

    /**
     * Get the last evaluation data (for display purposes)
     * @returns {Object|null} Last evaluation
     */
    getLastEvaluation() {
        // This will be updated via the 'evaluation' message type
        return null; // The UI will be updated directly via messages
    }
}

// Export a singleton instance
export const AI = new AIController();
