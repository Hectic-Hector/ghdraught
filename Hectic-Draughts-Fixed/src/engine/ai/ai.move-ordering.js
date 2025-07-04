/**
 * AI Move Ordering Module - Intelligent move ordering for efficient search
 * Uses various heuristics to examine the most promising moves first
 * @module ai.move-ordering
 */

import { PIECE, PLAYER } from '../constants.js';
import { makeMove, generateMoves, shouldPromote } from './ai.utils.js';
import { staticExchangeEvaluation, isMoveReallySafe, isProtected } from './ai.safety.js';
import { countCaptureValue } from './ai.tactics.js';
import { evaluateMaterial } from './ai.evaluation.js';

/**
 * Orders moves during search for optimal alpha-beta pruning
 * @param {Array} moves - Moves to order
 * @param {Object} position - Current position
 * @param {number} ply - Current search depth
 * @param {Object} ai - AI instance for accessing tables
 * @returns {Array} Ordered moves
 */
export function orderMoves(moves, position, ply, ai) {
    moves.forEach(move => {
        let score = 0;
        
        // 1. Hash move (best move from transposition table)
        const ttEntry = ai.cache.lookup(ai.cache.generateKey(position), 0, -Infinity, Infinity);
        if (ttEntry && ttEntry.bestMove && isSameMove(move, ttEntry.bestMove)) {
            score += 10000;
        }
        
        // 2. Captures ordered by MVV-LVA (Most Valuable Victim - Least Valuable Attacker)
        if (move.captures && move.captures.length > 0) {
            const captureValue = countCaptureValue(position, move);
            const attackerValue = getPieceValue(position.pieces[move.from.row][move.from.col]);
            score += 1000 + captureValue - attackerValue / 10;
            
            // Bonus for multiple captures
            score += move.captures.length * 100;
        }
        
        // 3. Killer moves (quiet moves that caused beta cutoff)
        if (ply < ai.killerMoves.length) {
            if (isSameMove(move, ai.killerMoves[ply][0])) {
                score += 900;
            } else if (isSameMove(move, ai.killerMoves[ply][1])) {
                score += 800;
            }
        }
        
        // 4. History heuristic
        const historyKey = getMoveKey(move);
        const historyScore = ai.historyTable.get(historyKey) || 0;
        score += Math.min(historyScore, 400);
        
        // 5. Promotion moves
        const piece = position.pieces[move.from.row][move.from.col];
        if (shouldPromote(piece, move.to.row)) {
            score += 700;
            
            // Extra bonus for promotion with capture
            if (move.captures && move.captures.length > 0) {
                score += 200;
            }
        }
        
        // 6. Central moves (toward center)
        const fromCenter = Math.abs(move.from.row - 4.5) + Math.abs(move.from.col - 4.5);
        const toCenter = Math.abs(move.to.row - 4.5) + Math.abs(move.to.col - 4.5);
        if (toCenter < fromCenter) {
            score += (fromCenter - toCenter) * 5;
        }
        
        // 7. Advancing moves (for men)
        if (!isKing(piece)) {
            const isWhite = piece === PIECE.WHITE;
            const advancement = isWhite ? 
                (move.from.row - move.to.row) : 
                (move.to.row - move.from.row);
            score += advancement * 10;
        }
        
        // 8. Tactical threats (moves that create captures)
        if (!move.captures || move.captures.length === 0) {
            const afterMove = makeMove(position, move);
            const threats = ai.getAvailableCaptures(afterMove);
            if (threats.length > 0) {
                score += 50 + threats.length * 10;
            }
        }
        
        move.orderScore = score;
    });
    
    // Sort by score (highest first)
    return moves.sort((a, b) => (b.orderScore || 0) - (a.orderScore || 0));
}

/**
 * Special move ordering for root node with safety checks
 * @param {Array} moves - Root moves to order
 * @param {Object} position - Current position
 * @param {Object} ai - AI instance
 * @returns {Array} Ordered moves with safety considered
 */
export function orderMovesAtRoot(moves, position, ai) {
    moves.forEach(move => {
        let score = 0;
        
        // Base score from quick evaluation
        score = quickEvaluateMove(position, move, ai) * 10;
        
        // CRITICAL: Safety check - heavily penalize unsafe moves
        if (!isMoveReallySafe(ai, position, move)) {
            score -= 1000;
        }
        
        // Check if move creates immediate threats
        const afterMove = makeMove(position, move);
        const ourNewCaptures = ai.getAvailableCaptures(afterMove);
        const threats = ourNewCaptures.filter(m => m.captures && m.captures.length > 0);
        score += threats.length * 20;
        
        // Bonus for moves that restrict opponent
        afterMove.currentPlayer = position.currentPlayer; // Switch back
        const opponentMoves = generateMoves(afterMove);
        if (opponentMoves.length <= 5) {
            score += (10 - opponentMoves.length) * 15;
        }
        
        // Previous best move bonus
        const ttEntry = ai.cache.lookup(ai.cache.generateKey(position), 0, -Infinity, Infinity);
        if (ttEntry && ttEntry.bestMove && isSameMove(move, ttEntry.bestMove)) {
            score += 500;
        }
        
        // Opening book bonus
        if (ai.openingBook && ai.openingBook.isBookMove(position, move)) {
            score += 300;
        }
        
        move.orderScore = score;
    });
    
    return moves.sort((a, b) => (b.orderScore || 0) - (a.orderScore || 0));
}

/**
 * Updates killer moves table
 * @param {Object} move - Move that caused beta cutoff
 * @param {number} ply - Current ply
 * @param {Array} killerMoves - Killer moves table
 */
export function updateKillerMoves(move, ply, killerMoves) {
    if (ply >= killerMoves.length) return;
    
    // Don't store captures as killer moves
    if (move.captures && move.captures.length > 0) return;
    
    // Avoid duplicates
    if (!isSameMove(move, killerMoves[ply][0])) {
        // Shift old killer to second slot
        killerMoves[ply][1] = killerMoves[ply][0];
        killerMoves[ply][0] = move;
    }
}

/**
 * Updates history heuristic table
 * @param {Object} move - Move that was good
 * @param {number} depth - Remaining depth when move was made
 * @param {Map} historyTable - History table
 */
export function updateHistory(move, depth, historyTable) {
    const key = getMoveKey(move);
    const current = historyTable.get(key) || 0;
    
    // Use depth squared for better scaling
    const increment = depth * depth;
    
    // Aging: reduce all scores slightly to prevent overflow
    if (current > 10000) {
        // Scale down all history scores
        for (const [k, v] of historyTable.entries()) {
            historyTable.set(k, Math.floor(v / 2));
        }
    }
    
    historyTable.set(key, current + increment);
}

/**
 * Quick static evaluation of a move for ordering
 * @param {Object} position - Current position
 * @param {Object} move - Move to evaluate
 * @param {Object} ai - AI instance
 * @returns {number} Quick evaluation score
 */
export function quickEvaluateMove(position, move, ai) {
    const piece = position.pieces[move.from.row][move.from.col];
    const isCapture = move.captures && move.captures.length > 0;
    
    // Apply the move
    const nextPosition = makeMove(position, move);
    
    // Base score: material difference
    let score = evaluateMaterial(nextPosition);
    
    // Penalty for leaving piece hanging
    if (!isCapture && staticExchangeEvaluation(ai, position, move) < 0) {
        score -= 80;
    }
    
    // Reward captures
    if (isCapture) {
        const capturedValue = countCaptureValue(position, move);
        score += capturedValue * 1.25;
    }
    
    // Positional factors
    if (isProtected(ai, nextPosition, move.to.row, move.to.col)) {
        score += 15;
    }
    
    // Penalty for moving to unprotected square
    if (!isProtected(ai, nextPosition, move.to.row, move.to.col)) {
        score -= 30;
    }
    
    // Promotion potential
    const distToPromotion = getPromotionDistance(piece, move.to.row);
    if (distToPromotion <= 2 && !isKing(piece)) {
        score += (3 - distToPromotion) * 40;
    }
    
    // King activity in endgame
    const pieceCount = countTotalPieces(position);
    if (pieceCount <= 12 && isKing(piece)) {
        const centerDist = Math.abs(move.to.row - 4.5) + Math.abs(move.to.col - 4.5);
        score += (15 - centerDist) * 2;
    }
    
    // Add small randomness for variety at lower levels
    if (ai.level <= 3) {
        score += Math.floor(Math.random() * 5) - 2;
    }
    
    return score;
}

/**
 * Gets a unique key for a move
 * @param {Object} move - Move object
 * @returns {string} Move key
 */
export function getMoveKey(move) {
    return `${move.from.row},${move.from.col}-${move.to.row},${move.to.col}`;
}

/**
 * Checks if two moves are the same
 * @param {Object} move1 - First move
 * @param {Object} move2 - Second move
 * @returns {boolean} True if moves are identical
 */
export function isSameMove(move1, move2) {
    if (!move1 || !move2) return false;
    
    return move1.from.row === move2.from.row &&
           move1.from.col === move2.from.col &&
           move1.to.row === move2.to.row &&
           move1.to.col === move2.to.col;
}

/**
 * Clears history table periodically to prevent overflow
 * @param {Map} historyTable - History table to clear
 */
export function clearHistoryTable(historyTable) {
    historyTable.clear();
}

/**
 * Gets statistical move ordering data
 * @param {Object} ai - AI instance
 * @returns {Object} Statistics about move ordering effectiveness
 */
export function getMoveOrderingStats(ai) {
    const stats = {
        killerHits: 0,
        historyHits: 0,
        ttHits: 0
    };
    
    // Count killer move effectiveness
    for (const killers of ai.killerMoves) {
        if (killers[0]) stats.killerHits++;
        if (killers[1]) stats.killerHits++;
    }
    
    // Count history table entries
    stats.historyHits = ai.historyTable.size;
    
    return stats;
}

// Helper functions

function getPieceValue(piece) {
    switch (piece) {
        case PIECE.WHITE:
        case PIECE.BLACK:
            return 100;
        case PIECE.WHITE_KING:
        case PIECE.BLACK_KING:
            return 450;
        default:
            return 0;
    }
}

function isKing(piece) {
    return piece === PIECE.WHITE_KING || piece === PIECE.BLACK_KING;
}

function getPromotionDistance(piece, row) {
    if (isKing(piece)) return Infinity;
    
    const isWhite = piece === PIECE.WHITE;
    const promotionRow = isWhite ? 0 : 9;
    return Math.abs(row - promotionRow);
}

function countTotalPieces(position) {
    let count = 0;
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
            if (position.pieces[r][c] !== PIECE.NONE) count++;
        }
    }
    return count;
}