/**
 * AI Safety Module - Advanced move safety checks and piece protection analysis
 * Ensures the AI never makes careless mistakes
 * @module ai.safety
 */

import { PIECE, PLAYER, BOARD_SIZE, DIRECTIONS } from '../constants.js';
import { 
    isValidSquare, 
    isPieceOfCurrentPlayer, 
    isOpponentPiece,
    isPlayerPiece,
    makeMove,
    getAvailableCaptures,
    getPieceCapturesFrom
} from './ai.utils.js';

/**
 * Comprehensive move safety check - ensures move doesn't lose material
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @param {Object} move - Move to check
 * @returns {boolean} True if move is safe
 */
export function isMoveReallySafe(ai, position, move) {
    // Captures are evaluated by SEE
    if (move.captures && move.captures.length > 0) {
        const see = staticExchangeEvaluation(ai, position, move);
        return see >= 0;
    }
    
    // For non-captures, check if we hang the piece
    const afterMove = makeMove(position, move);
    afterMove.currentPlayer = position.currentPlayer; // Switch back to see opponent's captures
    
    const responses = getAvailableCaptures(afterMove);
    if (responses.length === 0) return true; // No captures possible
    
    // Check if moving piece can be captured
    const movingPieceCanBeCaptured = responses.some(response => 
        response.captures.some(cap => cap.row === move.to.row && cap.col === move.to.col)
    );
    
    if (!movingPieceCanBeCaptured) return true;
    
    // Check if we have adequate defense
    const ourPiece = position.pieces[move.from.row][move.from.col];
    const pieceValue = getPieceValue(ourPiece);
    
    // See if the piece is defended after the move
    if (isProtected(ai, afterMove, move.to.row, move.to.col, position.currentPlayer)) {
        // Check exchange value
        const exchangeValue = evaluateExchange(ai, afterMove, move.to.row, move.to.col);
        return exchangeValue >= -pieceValue / 2; // Accept small material loss if necessary
    }
    
    // Undefended piece - check if we can recapture with profit
    const maxRecaptureGain = evaluateBestRecapture(ai, afterMove, move.to.row, move.to.col);
    
    return maxRecaptureGain >= pieceValue * 0.8; // Must recover most of the value
}

/**
 * Static Exchange Evaluation - evaluates a capture sequence
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @param {Object} move - Capture move to evaluate
 * @returns {number} Material gain/loss from the exchange
 */
export function staticExchangeEvaluation(ai, position, move) {
    if (!move.captures || move.captures.length === 0) return 0;
    
    // Initial material gain from captures
    let gain = 0;
    move.captures.forEach(cap => {
        gain += getPieceValue(position.pieces[cap.row][cap.col]);
    });
    
    // Simulate the exchange
    const afterMove = makeMove(position, move);
    afterMove.currentPlayer = position.currentPlayer; // Switch back
    
    // Find best recapture
    const recaptures = getAvailableCaptures(afterMove).filter(recap =>
        recap.captures.some(cap => cap.row === move.to.row && cap.col === move.to.col)
    );
    
    if (recaptures.length === 0) return gain; // No recapture possible
    
    // Find the least valuable attacker (MVV-LVA principle)
    let bestRecapture = null;
    let bestRecaptureValue = Infinity;
    
    for (const recap of recaptures) {
        const attackerValue = getPieceValue(afterMove.pieces[recap.from.row][recap.from.col]);
        if (attackerValue < bestRecaptureValue) {
            bestRecaptureValue = attackerValue;
            bestRecapture = recap;
        }
    }
    
    if (bestRecapture) {
        // Subtract the value of our piece that gets captured
        const ourPieceValue = getPieceValue(position.pieces[move.from.row][move.from.col]);
        gain -= ourPieceValue;
        
        // Recursively evaluate the continuation
        const continuation = staticExchangeEvaluation(ai, afterMove, bestRecapture);
        gain -= continuation; // Opponent's gain is our loss
    }
    
    return gain;
}

/**
 * Checks if a piece is protected at a given square
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @param {number} row - Row to check
 * @param {number} col - Column to check
 * @param {number} player - Player whose piece to check
 * @returns {boolean} True if protected
 */
export function isProtected(ai, position, row, col, player = position.currentPlayer) {
    const dirs = DIRECTIONS.KING_MOVES;
    const opponent = player === PLAYER.WHITE ? PLAYER.BLACK : PLAYER.WHITE;
    
    let protectors = 0;
    let attackers = 0;
    
    // Check all adjacent squares
    for (const dir of dirs) {
        const r = row + dir.dy;
        const c = col + dir.dx;
        if (!isValidSquare(r, c)) continue;
        
        const neighbor = position.pieces[r][c];
        if (isPlayerPiece(neighbor, player)) {
            protectors++;
        } else if (isPlayerPiece(neighbor, opponent)) {
            // Check if this opponent piece can actually capture
            const opponentCaptures = getPieceCapturesFrom(
                { ...position, currentPlayer: opponent }, 
                { row: r, col: c, piece: neighbor }
            );
            
            if (opponentCaptures.some(cap => 
                cap.captures.some(target => target.row === row && target.col === col))) {
                attackers++;
            }
        }
    }
    
    // Also check for long-range king attacks
    const kingAttackers = countLongRangeAttackers(position, row, col, opponent);
    attackers += kingAttackers;
    
    return protectors >= attackers && protectors > 0;
}

/**
 * Counts pieces defending a square
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @param {number} row - Row to check
 * @param {number} col - Column to check
 * @param {number} player - Player whose defenders to count
 * @returns {number} Number of defenders
 */
export function countDefenders(ai, position, row, col, player = position.currentPlayer) {
    let defenders = 0;
    const dirs = DIRECTIONS.KING_MOVES;
    
    // Check adjacent squares for defenders
    for (const dir of dirs) {
        const r = row + dir.dy;
        const c = col + dir.dx;
        if (!isValidSquare(r, c)) continue;
        
        const piece = position.pieces[r][c];
        if (isPlayerPiece(piece, player)) {
            // Check if this piece actually defends (can recapture)
            if (canDefend(position, { row: r, col: c }, { row, col })) {
                defenders++;
            }
        }
    }
    
    // Check for long-range king defenders
    defenders += countLongRangeDefenders(position, row, col, player);
    
    return defenders;
}

/**
 * Counts pieces attacking a square
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @param {number} row - Row to check
 * @param {number} col - Column to check
 * @param {number} attackingPlayer - Player whose attackers to count
 * @returns {number} Number of attackers
 */
export function countAttackers(ai, position, row, col, attackingPlayer) {
    let attackers = 0;
    
    // Create a dummy piece at the target square to check captures
    const testPosition = {
        ...position,
        currentPlayer: attackingPlayer
    };
    
    // Temporarily place an opponent piece at the target square
    const originalPiece = testPosition.pieces[row][col];
    const dummyPiece = attackingPlayer === PLAYER.WHITE ? PIECE.BLACK : PIECE.WHITE;
    testPosition.pieces[row][col] = dummyPiece;
    
    // Get all captures in this position
    const captures = getAvailableCaptures(testPosition);
    
    // Count how many can capture our dummy piece
    attackers = captures.filter(move =>
        move.captures.some(cap => cap.row === row && cap.col === col)
    ).length;
    
    // Restore original piece
    testPosition.pieces[row][col] = originalPiece;
    
    return attackers;
}

/**
 * Evaluates if a capture sequence is safe
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @param {Object} move - Capture move
 * @returns {boolean} True if capture gains material
 */
export function isSafeCapture(ai, position, move) {
    if (!move.captures || move.captures.length === 0) return true;
    
    const see = staticExchangeEvaluation(ai, position, move);
    return see > 0; // Strictly positive for captures
}

/**
 * Checks if a piece can be safely advanced
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @param {Object} from - Source square
 * @param {Object} to - Target square
 * @returns {boolean} True if advancement is safe
 */
export function canSafelyAdvance(ai, position, from, to) {
    const move = { from, to, captures: [] };
    return isMoveReallySafe(ai, position, move);
}

/**
 * Evaluates piece vulnerability at a square
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @param {number} row - Row to check
 * @param {number} col - Column to check
 * @returns {number} Vulnerability score (0 = safe, positive = vulnerable)
 */
export function evaluatePieceVulnerability(ai, position, row, col) {
    const piece = position.pieces[row][col];
    if (piece === PIECE.NONE) return 0;
    
    const player = piece === PIECE.WHITE || piece === PIECE.WHITE_KING ? 
                   PLAYER.WHITE : PLAYER.BLACK;
    const opponent = player === PLAYER.WHITE ? PLAYER.BLACK : PLAYER.WHITE;
    
    const defenders = countDefenders(ai, position, row, col, player);
    const attackers = countAttackers(ai, position, row, col, opponent);
    
    if (attackers === 0) return 0; // Completely safe
    
    const pieceValue = getPieceValue(piece);
    let vulnerability = 0;
    
    if (defenders < attackers) {
        // Under-defended
        vulnerability = pieceValue * (attackers - defenders) / attackers;
    } else if (defenders === attackers) {
        // Equal exchange - check if we lose value
        const exchange = evaluateExchange(ai, position, row, col);
        if (exchange < 0) {
            vulnerability = Math.abs(exchange);
        }
    }
    
    // Extra penalty for undefended pieces
    if (defenders === 0 && attackers > 0) {
        vulnerability *= 1.5;
    }
    
    return vulnerability;
}

/**
 * Finds safe squares for a piece to move to
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @param {number} row - Current row
 * @param {number} col - Current column
 * @returns {Array} Array of safe destination squares
 */
export function findSafeSquares(ai, position, row, col) {
    const piece = position.pieces[row][col];
    if (piece === PIECE.NONE) return [];
    
    const isKing = piece === PIECE.WHITE_KING || piece === PIECE.BLACK_KING;
    const player = piece === PIECE.WHITE || piece === PIECE.WHITE_KING ? 
                   PLAYER.WHITE : PLAYER.BLACK;
    
    const safeSquares = [];
    const dirs = DIRECTIONS.KING_MOVES;
    
    for (const dir of dirs) {
        if (isKing) {
            // Check all squares along diagonal
            let r = row + dir.dy;
            let c = col + dir.dx;
            
            while (isValidSquare(r, c) && position.pieces[r][c] === PIECE.NONE) {
                const testMove = { 
                    from: { row, col }, 
                    to: { row: r, col: c }, 
                    captures: [] 
                };
                
                if (isMoveReallySafe(ai, position, testMove)) {
                    safeSquares.push({ row: r, col: c });
                }
                
                r += dir.dy;
                c += dir.dx;
            }
        } else {
            // Regular piece - check one square
            const r = row + dir.dy;
            const c = col + dir.dx;
            
            if (isValidSquare(r, c) && position.pieces[r][c] === PIECE.NONE) {
                const testMove = { 
                    from: { row, col }, 
                    to: { row: r, col: c }, 
                    captures: [] 
                };
                
                if (isMoveReallySafe(ai, position, testMove)) {
                    safeSquares.push({ row: r, col: c });
                }
            }
        }
    }
    
    return safeSquares;
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

function canDefend(position, defender, target) {
    // Simplified - checks if defender is adjacent and can potentially recapture
    const rowDiff = Math.abs(defender.row - target.row);
    const colDiff = Math.abs(defender.col - target.col);
    return rowDiff === 1 && colDiff === 1;
}

function countLongRangeAttackers(position, row, col, attackingPlayer) {
    let count = 0;
    const dirs = DIRECTIONS.KING_MOVES;
    
    // Check each diagonal for enemy kings
    for (const dir of dirs) {
        let r = row + dir.dy;
        let c = col + dir.dx;
        let distance = 1;
        
        while (isValidSquare(r, c) && distance <= 8) {
            const piece = position.pieces[r][c];
            
            if (piece !== PIECE.NONE) {
                // Check if it's an enemy king
                if ((attackingPlayer === PLAYER.WHITE && piece === PIECE.WHITE_KING) ||
                    (attackingPlayer === PLAYER.BLACK && piece === PIECE.BLACK_KING)) {
                    // Check if there's a landing square
                    const landR = row - dir.dy;
                    const landC = col - dir.dx;
                    if (isValidSquare(landR, landC) && position.pieces[landR][landC] === PIECE.NONE) {
                        count++;
                    }
                }
                break; // Blocked
            }
            
            r += dir.dy;
            c += dir.dx;
            distance++;
        }
    }
    
    return count;
}

function countLongRangeDefenders(position, row, col, player) {
    let count = 0;
    const dirs = DIRECTIONS.KING_MOVES;
    
    // Check each diagonal for friendly kings
    for (const dir of dirs) {
        let r = row + dir.dy;
        let c = col + dir.dx;
        
        while (isValidSquare(r, c)) {
            const piece = position.pieces[r][c];
            
            if (piece !== PIECE.NONE) {
                // Check if it's a friendly king
                if ((player === PLAYER.WHITE && piece === PIECE.WHITE_KING) ||
                    (player === PLAYER.BLACK && piece === PIECE.BLACK_KING)) {
                    count++;
                }
                break; // Blocked
            }
            
            r += dir.dy;
            c += dir.dx;
        }
    }
    
    return count;
}

function evaluateExchange(ai, position, row, col) {
    // Simplified exchange evaluation
    const piece = position.pieces[row][col];
    if (piece === PIECE.NONE) return 0;
    
    const player = piece === PIECE.WHITE || piece === PIECE.WHITE_KING ? 
                   PLAYER.WHITE : PLAYER.BLACK;
    const opponent = player === PLAYER.WHITE ? PLAYER.BLACK : PLAYER.WHITE;
    
    const ourValue = getPieceValue(piece);
    const defenders = countDefenders(ai, position, row, col, player);
    const attackers = countAttackers(ai, position, row, col, opponent);
    
    if (attackers === 0) return 0;
    if (defenders >= attackers) return 0; // Even or favorable exchange
    
    // We lose the piece
    return -ourValue;
}

function evaluateBestRecapture(ai, position, row, col) {
    const opponent = position.currentPlayer === PLAYER.WHITE ? PLAYER.BLACK : PLAYER.WHITE;
    const recapturePos = { ...position, currentPlayer: opponent };
    
    const recaptures = getAvailableCaptures(recapturePos);
    let maxGain = 0;
    
    for (const recap of recaptures) {
        const gain = recap.captures.reduce((sum, cap) => 
            sum + getPieceValue(position.pieces[cap.row][cap.col]), 0);
        maxGain = Math.max(maxGain, gain);
    }
    
    return maxGain;
}