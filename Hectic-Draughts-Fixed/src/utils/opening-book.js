/**
 * International Draughts Opening Book - FIXED VERSION
 * - Completely rewritten logic to properly traverse opening variations
 * - Now correctly handles nested structures and move sequences
 * - Improved performance and reliability
 * @author codewithheck
 * Fixed by systematic review
 */

class OpeningBook {
    static instance = null;
    bookData = {};
    
    constructor() {
        if (OpeningBook.instance) {
            throw new Error('Use OpeningBook.getInstance() instead of new constructor');
        }
    }
    
    static async getInstance() {
        if (!OpeningBook.instance) {
            OpeningBook.instance = new OpeningBook();
            await OpeningBook.instance.initialize();
        }
        return OpeningBook.instance;
    }
    
    async initialize() {
        try {
            // Fixed path - assuming the openings.json is in the same directory
            const response = await fetch('openings.json');
            if (!response.ok) {
                // Fallback path
                const fallbackResponse = await fetch('src/data/openings.json');
                if (!fallbackResponse.ok) {
                    throw new Error(`Failed to load opening book: ${response.statusText}`);
                }
                this.bookData = await fallbackResponse.json();
            } else {
                this.bookData = await response.json();
            }
            console.log('Opening book loaded successfully with', this.bookData.openings?.length || 0, 'openings');
        } catch (error) {
            console.warn('Opening book not available:', error);
            this.bookData = { openings: [] };
        }
    }

    /**
     * FIXED: Finds possible next moves from the opening book based on move history
     * @param {string[]} moveHistory - Array of move notations played so far
     * @returns {string[]} Array of valid next move notations from the book
     */
    getOpeningMoves(moveHistory) {
        if (!this.bookData.openings || this.bookData.openings.length === 0 || !moveHistory) {
            return [];
        }

        // If no moves played yet, return first moves from all openings
        if (moveHistory.length === 0) {
            return this.bookData.openings
                .map(opening => this.getFirstMove(opening.moves))
                .filter(move => move);
        }

        const possibleMoves = new Set();

        // Check each opening line
        for (const opening of this.bookData.openings) {
            const moves = this.findMovesInOpening(opening, moveHistory);
            moves.forEach(move => possibleMoves.add(move));
        }

        return Array.from(possibleMoves);
    }

    /**
     * Recursively searches through an opening structure for matching moves
     * @param {Object} openingNode - Opening or variation node
     * @param {string[]} moveHistory - Moves played so far
     * @param {number} depth - Current depth in move history
     * @returns {string[]} Possible next moves
     */
    findMovesInOpening(openingNode, moveHistory, depth = 0) {
        const possibleMoves = [];
        
        if (!openingNode.moves) return possibleMoves;

        // Parse the moves in this line
        const lineMoves = openingNode.moves.split(' ').filter(m => m.trim());
        
        // Check if this line matches our move history so far
        let matches = true;
        for (let i = 0; i < Math.min(depth + lineMoves.length, moveHistory.length); i++) {
            const lineIndex = i - depth;
            if (lineIndex >= 0 && lineIndex < lineMoves.length) {
                if (lineMoves[lineIndex] !== moveHistory[i]) {
                    matches = false;
                    break;
                }
            }
        }

        if (matches) {
            // If we've played all moves in this line, get the next move
            const nextMoveIndex = moveHistory.length - depth;
            if (nextMoveIndex >= 0 && nextMoveIndex < lineMoves.length) {
                possibleMoves.push(lineMoves[nextMoveIndex]);
            }

            // Also check variations and subvariations
            const newDepth = depth + lineMoves.length;
            
            if (openingNode.variations) {
                for (const variation of openingNode.variations) {
                    const variationMoves = this.findMovesInOpening(variation, moveHistory, newDepth);
                    possibleMoves.push(...variationMoves);
                }
            }

            if (openingNode.subvariations) {
                for (const subvariation of openingNode.subvariations) {
                    const subMoves = this.findMovesInOpening(subvariation, moveHistory, newDepth);
                    possibleMoves.push(...subMoves);
                }
            }
        }

        return possibleMoves;
    }

    /**
     * Extracts the first move from a move sequence
     * @param {string} moveSequence - Space-separated move sequence
     * @returns {string|null} First move or null
     */
    getFirstMove(moveSequence) {
        if (!moveSequence) return null;
        const moves = moveSequence.split(' ').filter(m => m.trim());
        return moves.length > 0 ? moves[0] : null;
    }

    /**
     * Gets evaluation for current position if available
     * @param {string[]} moveHistory - Moves played so far
     * @returns {Object|null} Evaluation data or null
     */
    getEvaluation(moveHistory) {
        if (!this.bookData.openings || moveHistory.length === 0) {
            return null;
        }

        // Find the deepest matching line
        let bestMatch = null;
        let maxDepth = 0;

        for (const opening of this.bookData.openings) {
            const match = this.findDeepestMatch(opening, moveHistory);
            if (match && match.depth > maxDepth) {
                maxDepth = match.depth;
                bestMatch = match.node;
            }
        }

        if (bestMatch && bestMatch.engineEval) {
            return {
                score: this.parseEvaluation(bestMatch.engineEval),
                source: 'opening_book',
                opening: bestMatch.name || 'Unknown Opening'
            };
        }

        return null;
    }

    /**
     * Finds the deepest matching node in an opening tree
     * @param {Object} openingNode - Opening node to search
     * @param {string[]} moveHistory - Move history to match
     * @param {number} depth - Current search depth
     * @returns {Object|null} Match result with depth and node
     */
    findDeepestMatch(openingNode, moveHistory, depth = 0) {
        if (!openingNode.moves) return null;

        const lineMoves = openingNode.moves.split(' ').filter(m => m.trim());
        
        // Check if this line matches
        let matchLength = 0;
        for (let i = 0; i < Math.min(lineMoves.length, moveHistory.length - depth); i++) {
            if (lineMoves[i] === moveHistory[depth + i]) {
                matchLength++;
            } else {
                break;
            }
        }

        let bestMatch = null;
        if (matchLength === lineMoves.length && matchLength > 0) {
            bestMatch = { depth: depth + matchLength, node: openingNode };
        }

        // Check variations for deeper matches
        const newDepth = depth + lineMoves.length;
        const variations = [...(openingNode.variations || []), ...(openingNode.subvariations || [])];
        
        for (const variation of variations) {
            const varMatch = this.findDeepestMatch(variation, moveHistory, newDepth);
            if (varMatch && (!bestMatch || varMatch.depth > bestMatch.depth)) {
                bestMatch = varMatch;
            }
        }

        return bestMatch;
    }

    /**
     * Parses evaluation string to numeric value
     * @param {string} evalStr - Evaluation string like "+0.42"
     * @returns {number} Numeric evaluation
     */
    parseEvaluation(evalStr) {
        if (!evalStr) return 0;
        const numStr = evalStr.replace(/[^-+0-9.]/g, '');
        return parseFloat(numStr) || 0;
    }

    /**
     * Gets opening statistics
     * @returns {Object} Opening book statistics
     */
    getStatistics() {
        return this.bookData.statistics || {};
    }

    /**
     * Checks if a position is in the opening book
     * @param {string[]} moveHistory - Move history
     * @returns {boolean} True if position is in book
     */
    isInBook(moveHistory) {
        return this.getOpeningMoves(moveHistory).length > 0;
    }
}

export default OpeningBook;