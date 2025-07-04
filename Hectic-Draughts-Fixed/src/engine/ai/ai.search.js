/**
 * AI Search Module - Core search algorithms for ruthless play
 * Implements iterative deepening, negamax with alpha-beta pruning, and advanced search techniques
 * @module ai.search
 */

import { AI_PARAMS } from './ai.params.js';
import { 
    generateMoves, 
    getAvailableCaptures, 
    makeMove, 
    countTotalPieces,
    getMoveNotation 
} from './ai.utils.js';
import { 
    orderMoves, 
    orderMovesAtRoot, 
    updateKillerMoves, 
    updateHistory,
    quickEvaluateMove 
} from './ai.move-ordering.js';
import { isMoveReallySafe } from './ai.safety.js';
import { evaluateCaptureSequence, countCaptureValue } from './ai.tactics.js';
import { evaluatePosition } from './ai.evaluation.js';

/**
 * Main search function - finds the best move for the current position
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @param {Array} moveHistoryNotations - Move history for opening book
 * @returns {Object|null} Best move found
 */
export async function getBestMove(ai, position, moveHistoryNotations) {
    const startTime = Date.now();
    ai.nodeCount = 0;
    ai.searchAborted = false;
    ai.positionHistory = [];
    
    // Clear old killer moves for new search
    ai.killerMoves = Array(100).fill(null).map(() => [null, null]);
    
    // Generate and validate moves
    const moves = generateMoves(position);
    
    if (moves.length === 0) {
        return null; // No legal moves
    }
    
    if (moves.length === 1) {
        postMessage({
            type: 'log',
            data: { message: 'Only one legal move available' }
        });
        return moves[0];
    }
    
    // Quick tactical scan for forced moves
    const tacticalResult = quickTacticalScan(ai, position, moves);
    if (tacticalResult.forced) {
        postMessage({
            type: 'log',
            data: { message: `Forced tactical move: ${getMoveNotation(tacticalResult.move)}` }
        });
        return tacticalResult.move;
    }
    
    // Time allocation
    const moveNumber = moveHistoryNotations ? moveHistoryNotations.length : 0;
    const baseTime = AI_PARAMS.ITERATIVE_DEEPENING.TIME_ALLOCATION[ai.level] || 3000;
    let timeLimit = allocateTime(ai, position, moveNumber, baseTime);
    
    // Adaptive depth based on position complexity
    let maxDepth = AI_PARAMS.MAX_DEPTH[ai.level] || 6;
    if (moves.length <= 3) {
        maxDepth += 1; // Search deeper in forcing positions
        timeLimit *= 1.5;
    }
    
    // Check opening book
    if (ai.openingBook && moveNumber < 20) {
        const bookMove = ai.openingBook.getMove(position, moveHistoryNotations);
        if (bookMove) {
            postMessage({
                type: 'log',
                data: { message: `Playing book move: ${getMoveNotation(bookMove)}` }
            });
            return bookMove;
        }
    }
    
    // Iterative deepening search
    let bestMove = moves[0];
    let bestScore = -Infinity;
    let lastScore = 0;
    
    for (let depth = 1; depth <= maxDepth; depth++) {
        const remainingTime = timeLimit - (Date.now() - startTime);
        if (remainingTime < timeLimit * 0.1 || ai.searchAborted) {
            break;
        }
        
        // Aspiration windows
        let alpha = -Infinity;
        let beta = Infinity;
        
        if (depth > 3 && Math.abs(lastScore) < 1000) {
            const delta = AI_PARAMS.ITERATIVE_DEEPENING.ASPIRATION_WINDOW.INITIAL_DELTA;
            alpha = lastScore - delta;
            beta = lastScore + delta;
        }
        
        const result = await searchBestMove(ai, position, depth, alpha, beta, startTime, timeLimit);
        
        // Re-search if aspiration window failed
        if (result.score <= alpha || result.score >= beta) {
            postMessage({
                type: 'log',
                data: { message: `Aspiration window failed at depth ${depth}, re-searching...` }
            });
            
            const retry = await searchBestMove(ai, position, depth, -Infinity, Infinity, startTime, timeLimit);
            if (retry.move) {
                result.move = retry.move;
                result.score = retry.score;
            }
        }
        
        if (result.timeout || ai.searchAborted) {
            break;
        }
        
        if (result.move) {
            bestMove = result.move;
            bestScore = result.score;
            lastScore = bestScore;
            
            // Send evaluation update
            postMessage({
                type: 'evaluation',
                data: {
                    score: bestScore,
                    depth: depth,
                    nodes: ai.nodeCount,
                    bestMove: getMoveNotation(bestMove),
                    nps: Math.floor(ai.nodeCount / ((Date.now() - startTime) / 1000))
                }
            });
            
            // Early exit conditions
            if (Math.abs(bestScore) > 5000) {
                postMessage({
                    type: 'log',
                    data: { message: 'Winning position found!' }
                });
                break;
            }
            
            // For ruthless play: if winning, search deeper to find the most crushing line
            if (bestScore > 1000 && depth < maxDepth - 2) {
                timeLimit *= 1.2; // Give more time to find the best win
            }
        }
    }
    
    // Final safety check
    if (!isMoveReallySafe(ai, position, bestMove)) {
        postMessage({
            type: 'log',
            data: { message: 'Best move appears unsafe, finding alternative...' }
        });
        
        const safeMoves = moves.filter(m => isMoveReallySafe(ai, position, m));
        if (safeMoves.length > 0) {
            safeMoves.sort((a, b) => quickEvaluateMove(position, b, ai) - quickEvaluateMove(position, a, ai));
            bestMove = safeMoves[0];
        }
    }
    
    const timeTaken = Date.now() - startTime;
    postMessage({
        type: 'log',
        data: { 
            message: `AI chose: ${getMoveNotation(bestMove)}, ` +
                    `Score: ${bestScore.toFixed(2)}, Time: ${timeTaken}ms, ` +
                    `Nodes: ${ai.nodeCount}, NPS: ${Math.floor(ai.nodeCount / (timeTaken / 1000))}`
        }
    });
    
    return bestMove;
}

/**
 * Searches for the best move at a given depth
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @param {number} depth - Search depth
 * @param {number} alpha - Alpha bound
 * @param {number} beta - Beta bound
 * @param {number} startTime - Search start time
 * @param {number} timeLimit - Time limit in ms
 * @returns {Object} Best move and score
 */
async function searchBestMove(ai, position, depth, alpha, beta, startTime, timeLimit) {
    let bestMove = null;
    let bestScore = -Infinity;
    
    const moves = orderMovesAtRoot(generateMoves(position), position, ai);
    
    for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        
        // Time check
        if (Date.now() - startTime > timeLimit || ai.searchAborted) {
            return { move: bestMove || moves[0], score: bestScore, timeout: true };
        }
        
        const newPosition = makeMove(position, move);
        newPosition.history = [...(position.history || []), ai.cache.generateKey(position)];
        
        let score;
        
        // Principal Variation Search (PVS)
        if (i === 0) {
            // Search first move with full window
            score = -negamax(ai, newPosition, depth - 1, -beta, -alpha, startTime, timeLimit, 0, 1);
        } else {
            // Null window search for other moves
            score = -negamax(ai, newPosition, depth - 1, -alpha - 1, -alpha, startTime, timeLimit, 0, 1);
            
            // Re-search if it fails high
            if (score > alpha && score < beta) {
                score = -negamax(ai, newPosition, depth - 1, -beta, -alpha, startTime, timeLimit, 0, 1);
            }
        }
        
        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
        
        alpha = Math.max(alpha, score);
        
        // Beta cutoff
        if (alpha >= beta) {
            updateKillerMoves(move, 0, ai.killerMoves);
            break;
        }
    }
    
    return { move: bestMove || moves[0], score: bestScore, timeout: false };
}

/**
 * Negamax search with alpha-beta pruning
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @param {number} depth - Remaining depth
 * @param {number} alpha - Alpha bound
 * @param {number} beta - Beta bound
 * @param {number} startTime - Search start time
 * @param {number} timeLimit - Time limit
 * @param {number} recursionDepth - Current recursion depth
 * @param {number} ply - Current ply from root
 * @returns {number} Position evaluation
 */
export function negamax(ai, position, depth, alpha, beta, startTime, timeLimit, recursionDepth = 0, ply = 0) {
    ai.nodeCount++;
    
    // Recursion limit
    if (recursionDepth > ai.maxRecursionDepth) {
        return evaluatePosition(ai, position);
    }
    
    // Time check
    if (ai.nodeCount % 2048 === 0 && Date.now() - startTime > timeLimit) {
        ai.searchAborted = true;
        return 0;
    }
    
    // Repetition detection
    const key = ai.cache.generateKey(position);
    if (position.history && position.history.filter(k => k === key).length >= 2) {
        return -50; // Slight penalty for repetition
    }
    
    // Terminal node or depth limit
    if (depth <= 0) {
        return quiescenceSearch(ai, position, alpha, beta, ai.quiescenceDepth, startTime, timeLimit, recursionDepth);
    }
    
    // Transposition table lookup
    const cached = ai.cache.lookup(key, depth, alpha, beta);
    if (cached && cached.useful !== false) {
        return cached.value;
    }
    
    // Generate moves
    const moves = generateMoves(position);
    if (moves.length === 0) {
        return -10000 + ply; // Checkmate, better if it happens later
    }
    
    // Adaptive depth extension for critical positions
    if (depth >= 2 && moves.length <= 3 && recursionDepth < 10) {
        depth += 1;
    }
    
    // Null Move Pruning
    if (depth >= 3 && recursionDepth > 0 && moves.length > 5 && !hasCaptures(position)) {
        const nullPos = {
            pieces: position.pieces,
            currentPlayer: position.currentPlayer === 1 ? 2 : 1,
            history: position.history
        };
        
        const R = depth > 6 ? 3 : 2;
        const nullScore = -negamax(ai, nullPos, depth - 1 - R, -beta, -beta + 1, startTime, timeLimit, recursionDepth + 1, ply);
        
        if (nullScore >= beta) {
            return beta;
        }
    }
    
    // Order moves
    const orderedMoves = orderMoves(moves, position, ply, ai);
    let bestScore = -Infinity;
    let bestMove = null;
    
    for (let i = 0; i < orderedMoves.length; i++) {
        const move = orderedMoves[i];
        const newPosition = makeMove(position, move);
        newPosition.history = [...(position.history || []), key];
        
        let reduction = 0;
        
        // Late Move Reductions (LMR)
        if (depth >= 3 && i >= 3 && (!move.captures || move.captures.length === 0) && !givesCheck(newPosition)) {
            reduction = 1;
            if (i >= 6) reduction = 2;
        }
        
        let score;
        
        if (i === 0) {
            // First move - search with full window
            score = -negamax(ai, newPosition, depth - 1, -beta, -alpha, startTime, timeLimit, recursionDepth + 1, ply + 1);
        } else {
            // LMR search with reduced depth
            score = -negamax(ai, newPosition, depth - 1 - reduction, -alpha - 1, -alpha, startTime, timeLimit, recursionDepth + 1, ply + 1);
            
            // Re-search at full depth if it improves alpha
            if (score > alpha && score < beta) {
                score = -negamax(ai, newPosition, depth - 1, -beta, -alpha, startTime, timeLimit, recursionDepth + 1, ply + 1);
            }
        }
        
        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
        
        alpha = Math.max(alpha, score);
        
        // Beta cutoff
        if (alpha >= beta) {
            // Update killer moves and history for quiet moves
            if (!move.captures || move.captures.length === 0) {
                updateKillerMoves(move, ply, ai.killerMoves);
                updateHistory(move, depth, ai.historyTable);
            }
            break;
        }
    }
    
    // Store in transposition table
    const type = bestScore <= alpha ? AI_PARAMS.CACHE.ENTRY_TYPES.UPPER_BOUND :
                bestScore >= beta ? AI_PARAMS.CACHE.ENTRY_TYPES.LOWER_BOUND :
                AI_PARAMS.CACHE.ENTRY_TYPES.EXACT;
    
    ai.cache.store(key, depth, bestScore, type, bestMove);
    
    return bestScore;
}

/**
 * Quiescence search to handle tactical positions
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @param {number} alpha - Alpha bound
 * @param {number} beta - Beta bound
 * @param {number} depth - Remaining quiescence depth
 * @param {number} startTime - Search start time
 * @param {number} timeLimit - Time limit
 * @param {number} recursionDepth - Current recursion depth
 * @returns {number} Position evaluation
 */
export function quiescenceSearch(ai, position, alpha, beta, depth, startTime, timeLimit, recursionDepth) {
    ai.nodeCount++;
    
    if (depth <= 0 || recursionDepth > ai.maxRecursionDepth + 10) {
        return evaluatePosition(ai, position);
    }
    
    // Stand pat score
    const standPat = evaluatePosition(ai, position);
    
    if (standPat >= beta) {
        return beta;
    }
    
    // Delta pruning
    const BIG_DELTA = 500; // Value of a king + margin
    if (standPat < alpha - BIG_DELTA) {
        return alpha;
    }
    
    if (alpha < standPat) {
        alpha = standPat;
    }
    
    // Get only captures
    const captures = getAvailableCaptures(position);
    
    if (captures.length === 0) {
        return standPat;
    }
    
    // Order captures by expected gain
    captures.sort((a, b) => {
        const aValue = evaluateCaptureSequence(ai, position, a);
        const bValue = evaluateCaptureSequence(ai, position, b);
        return bValue - aValue;
    });
    
    for (const move of captures) {
        // SEE pruning - skip bad captures
        if (ai.staticExchangeEvaluation(position, move) < 0) {
            continue;
        }
        
        const newPosition = makeMove(position, move);
        const score = -quiescenceSearch(ai, newPosition, -beta, -alpha, depth - 1, startTime, timeLimit, recursionDepth + 1);
        
        if (score >= beta) {
            return beta;
        }
        
        if (score > alpha) {
            alpha = score;
        }
    }
    
    return alpha;
}

/**
 * Quick tactical scan for forced moves
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @param {Array} moves - Available moves
 * @returns {Object} Forced move if exists
 */
function quickTacticalScan(ai, position, moves) {
    // Check if we must respond to threats
    const captures = moves.filter(m => m.captures && m.captures.length > 0);
    
    if (captures.length > 0) {
        // Must capture - find best one
        captures.sort((a, b) => {
            const aValue = evaluateCaptureSequence(ai, position, a);
            const bValue = evaluateCaptureSequence(ai, position, b);
            return bValue - aValue;
        });
        
        // If one capture is clearly best, play it quickly
        if (captures.length === 1 || 
            (captures.length > 1 && evaluateCaptureSequence(ai, position, captures[0]) > 
             evaluateCaptureSequence(ai, position, captures[1]) + 100)) {
            return { forced: true, move: captures[0] };
        }
    }
    
    return { forced: false };
}

/**
 * Allocates time for the current move
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @param {number} moveNumber - Current move number
 * @param {number} baseTime - Base time allocation
 * @returns {number} Time to use in milliseconds
 */
function allocateTime(ai, position, moveNumber, baseTime) {
    let time = baseTime;
    
    // Adjust based on game phase
    if (moveNumber < 10) {
        time *= 0.7; // Faster in opening
    }
    
    const totalPieces = countTotalPieces(position);
    if (totalPieces <= 10) {
        time *= 1.5; // More time in endgame
    }
    
    // More time for complex positions
    const captures = getAvailableCaptures(position);
    if (captures.length > 0) {
        const maxCaptures = Math.max(...captures.map(m => m.captures.length));
        if (maxCaptures >= 3) {
            time *= 2.0; // Much more time for combinations
        } else if (maxCaptures >= 2) {
            time *= 1.5;
        }
    }
    
    // Apply level multiplier
    const multiplier = AI_PARAMS.ITERATIVE_DEEPENING.COMPLEX_POSITION_MULTIPLIER[ai.level] || 1.0;
    
    return Math.min(time * multiplier, baseTime * 3);
}

// Helper functions

function hasCaptures(position) {
    return getAvailableCaptures(position).length > 0;
}

function givesCheck(position) {
    return getAvailableCaptures(position).length > 0;
}