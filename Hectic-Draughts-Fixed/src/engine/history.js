/**
 * History class for hectic-game - FULLY IMPLEMENTED
 * - Complete undo/redo functionality
 * - Proper state management
 * - Enhanced navigation features
 * @author codewithheck
 * Fixed by systematic review
 */

export class History {
    constructor(game) {
        this.game = game;
        this.history = [];
        this.currentIndex = -1;
        this.redoStack = []; // Store future moves for redo
    }

    /**
     * Records a move to the history
     * @param {Object} moveRecord - Complete move record with FEN
     */
    recordMove(moveRecord) {
        // If we're in the middle of history and make a new move, clear the future
        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
            this.redoStack = []; // Clear redo stack when new move is made
        }

        this.history.push(moveRecord);
        this.currentIndex = this.history.length - 1;
        this.redoStack = []; // Clear redo stack after new move
    }

    /**
     * Undo the last move
     * @returns {boolean} True if undo was successful
     */
    undo() {
        if (this.currentIndex <= 0) {
            console.log('Cannot undo: at start of game');
            return false;
        }

        // Store current state for redo
        const currentState = {
            fen: this.game.getFEN(),
            index: this.currentIndex
        };
        this.redoStack.push(currentState);

        // Go back one move
        this.currentIndex--;
        
        if (this.currentIndex === -1) {
            // Return to starting position
            this.game.reset();
        } else {
            // Load the previous position
            const previousMove = this.history[this.currentIndex];
            if (previousMove && previousMove.fen) {
                this.game.loadFEN(previousMove.fen);
            }
        }

        console.log(`Undid move, now at position ${this.currentIndex + 1}`);
        return true;
    }

    /**
     * Redo the next move
     * @returns {boolean} True if redo was successful
     */
    redo() {
        if (this.redoStack.length === 0) {
            console.log('Cannot redo: no future moves available');
            return false;
        }

        const nextState = this.redoStack.pop();
        this.currentIndex = nextState.index;
        
        if (this.currentIndex < this.history.length) {
            const nextMove = this.history[this.currentIndex];
            if (nextMove && nextMove.fen) {
                this.game.loadFEN(nextMove.fen);
            }
        }

        console.log(`Redid move, now at position ${this.currentIndex + 1}`);
        return true;
    }

    /**
     * Jump to a specific move in history
     * @param {number} index - Move index to jump to (-1 for start)
     * @returns {boolean} True if jump was successful
     */
    jumpToMove(index) {
        if (index < -1 || index >= this.history.length) {
            console.log(`Cannot jump to move ${index}: out of range`);
            return false;
        }

        // Store current state for potential redo
        if (index !== this.currentIndex) {
            const currentState = {
                fen: this.game.getFEN(),
                index: this.currentIndex
            };
            
            // Only add to redo stack if jumping backwards
            if (index < this.currentIndex) {
                this.redoStack.push(currentState);
            } else {
                // If jumping forward, clear redo stack
                this.redoStack = [];
            }
        }

        this.currentIndex = index;

        if (index === -1) {
            // Jump to start
            this.game.reset();
        } else {
            // Jump to specific position
            const targetMove = this.history[index];
            if (targetMove && targetMove.fen) {
                this.game.loadFEN(targetMove.fen);
            }
        }

        console.log(`Jumped to position ${index + 1}`);
        return true;
    }

    /**
     * Jump to the start of the game
     * @returns {boolean} True if successful
     */
    jumpToStart() {
        return this.jumpToMove(-1);
    }

    /**
     * Jump to the end of the game (latest position)
     * @returns {boolean} True if successful
     */
    jumpToEnd() {
        return this.jumpToMove(this.history.length - 1);
    }

    /**
     * Go to the previous move
     * @returns {boolean} True if successful
     */
    previousMove() {
        if (this.currentIndex > -1) {
            return this.jumpToMove(this.currentIndex - 1);
        }
        return false;
    }

    /**
     * Go to the next move
     * @returns {boolean} True if successful
     */
    nextMove() {
        if (this.currentIndex < this.history.length - 1) {
            return this.jumpToMove(this.currentIndex + 1);
        }
        return false;
    }

    /**
     * Clear all history
     */
    clear() {
        this.history = [];
        this.currentIndex = -1;
        this.redoStack = [];
        console.log('History cleared');
    }

    /**
     * Get the complete history
     * @returns {Array} Array of move records
     */
    getHistory() {
        return this.history;
    }

    /**
     * Get the current position index
     * @returns {number} Current index (-1 for start position)
     */
    getCurrentIndex() {
        return this.currentIndex;
    }

    /**
     * Check if undo is possible
     * @returns {boolean} True if can undo
     */
    canUndo() {
        return this.currentIndex > -1;
    }

    /**
     * Check if redo is possible
     * @returns {boolean} True if can redo
     */
    canRedo() {
        return this.redoStack.length > 0;
    }

    /**
     * Get move at specific index
     * @param {number} index - Move index
     * @returns {Object|null} Move record or null
     */
    getMoveAt(index) {
        if (index >= 0 && index < this.history.length) {
            return this.history[index];
        }
        return null;
    }

    /**
     * Get the current move
     * @returns {Object|null} Current move record or null
     */
    getCurrentMove() {
        return this.getMoveAt(this.currentIndex);
    }

    /**
     * Get history statistics
     * @returns {Object} Statistics about the game history
     */
    getStatistics() {
        return {
            totalMoves: this.history.length,
            currentPosition: this.currentIndex + 1,
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            redoMovesAvailable: this.redoStack.length
        };
    }

    /**
     * Export history as JSON
     * @returns {string} JSON representation of history
     */
    exportHistory() {
        return JSON.stringify({
            history: this.history,
            currentIndex: this.currentIndex,
            timestamp: Date.now()
        }, null, 2);
    }

    /**
     * Import history from JSON
     * @param {string} jsonData - JSON string to import
     * @returns {boolean} True if import was successful
     */
    importHistory(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            if (data.history && Array.isArray(data.history)) {
                this.history = data.history;
                this.currentIndex = data.currentIndex || -1;
                this.redoStack = []; // Clear redo stack on import
                
                // Validate current index
                if (this.currentIndex >= this.history.length) {
                    this.currentIndex = this.history.length - 1;
                }
                
                return true;
            }
        } catch (error) {
            console.error('Failed to import history:', error);
        }
        return false;
    }
}