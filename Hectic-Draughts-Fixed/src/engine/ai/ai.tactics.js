/**
 * AI Tactics Module - Advanced tactical analysis for ruthless play
 * Handles capture sequences, threats, and tactical opportunities
 * @module ai.tactics
 */

import { PIECE, PLAYER, BOARD_SIZE, DIRECTIONS } from '../constants.js';
import { 
    makeMove,
    getAvailableCaptures,
    getPieceCapturesFrom,
    generateMoves,
    isValidSquare,
    isPlayerPiece,
    shouldPromote
} from './ai.utils.js';

/**
 * Evaluates a capture sequence with deep analysis
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @param {Object} move - Capture move to evaluate
 * @returns {number} Net value of the capture sequence
 */
export function evaluateCaptureSequence(ai, position, move) {
    if (!move.captures || move.captures.length === 0) return 0;
    
    // Base capture value
    let value = countCaptureValue(position, move);
    
    // Bonus for multiple captures (tempo advantage)
    value += move.captures.length * 20;
    
    // Check if we get promoted after capture
    const movingPiece = position.pieces[move.from.row][move.from.col];
    if (shouldPromote(movingPiece, move.to.row)) {
        value += 250; // Promotion bonus
    }
    
    // Analyze position after capture
    const afterMove = makeMove(position, move);
    
    // Check for follow-up captures (maintaining initiative)
    const followUpCaptures = getAvailableCaptures(afterMove);
    if (followUpCaptures.length > 0) {
        const bestFollowUp = Math.max(...followUpCaptures.map(fc => 
            countCaptureValue(afterMove, fc)
        ));
        value += bestFollowUp * 0.5; // Discounted future captures
    }
    
    // Check opponent's counter-captures
    afterMove.currentPlayer = position.currentPlayer; // Switch back
    const counterCaptures = getAvailableCaptures(afterMove);
    
    if (counterCaptures.length > 0) {
        // Find the most damaging counter
        let maxCounterDamage = 0;
        
        for (const counter of counterCaptures) {
            const damage = countCaptureValue(afterMove, counter);
            
            // Extra penalty if they recapture our moved piece
            if (counter.captures.some(cap => 
                cap.row === move.to.row && cap.col === move.to.col)) {
                const ourPieceValue = getPieceValue(movingPiece);
                maxCounterDamage = Math.max(maxCounterDamage, damage + ourPieceValue);
            } else {
                maxCounterDamage = Math.max(maxCounterDamage, damage);
            }
        }
        
        value -= maxCounterDamage * 0.8; // Discount factor for opponent's best response
    }
    
    // Positional bonus for captures that improve our position
    value += evaluateCapturePositional(position, move);
    
    return value;
}

/**
 * Counts the material value of captures
 * @param {Object} position - Current position
 * @param {Object} move - Move with captures
 * @returns {number} Total material value captured
 */
export function countCaptureValue(position, move) {
    if (!move.captures || move.captures.length === 0) return 0;
    
    return move.captures.reduce((total, cap) => {
        const piece = position.pieces[cap.row][cap.col];
        return total + getPieceValue(piece);
    }, 0);
}

/**
 * Checks if current position has captures available
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @returns {boolean} True if captures exist
 */
export function canCapture(ai, position) {
    return getAvailableCaptures(position).length > 0;
}

/**
 * Checks if a move creates threats
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @param {Object} move - Move to check
 * @returns {boolean} True if move creates capture threats
 */
export function canThreaten(ai, position, move) {
    const afterMove = makeMove(position, move);
    const threats = getAvailableCaptures(afterMove);
    
    // Count valuable threats
    let threatValue = 0;
    for (const threat of threats) {
        threatValue += countCaptureValue(afterMove, threat);
    }
    
    return threatValue > 0;
}

/**
 * Checks if position is in check (has forced captures)
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @returns {boolean} True if must capture
 */
export function inCheck(ai, position) {
    const captures = getAvailableCaptures(position);
    return captures.length > 0; // In draughts, captures are mandatory
}

/**
 * Checks if move gives check (forces opponent captures)
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @param {Object} move - Move to check
 * @returns {boolean} True if creates forced captures for opponent
 */
export function givesCheck(ai, position, move) {
    const afterMove = makeMove(position, move);
    return inCheck(ai, afterMove);
}

/**
 * Finds tactical shots (unexpected strong moves)
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @returns {Array} Array of tactical moves with evaluations
 */
export function findTacticalShots(ai, position) {
    const tacticalMoves = [];
    const moves = generateMoves(position);
    
    for (const move of moves) {
        let tacticalValue = 0;
        
        // Multi-captures are always tactical
        if (move.captures && move.captures.length >= 2) {
            tacticalValue += move.captures.length * 100;
        }
        
        // Check for promotion tactics
        const piece = position.pieces[move.from.row][move.from.col];
        if (shouldPromote(piece, move.to.row)) {
            tacticalValue += 200;
            
            // Promotion with capture is extra strong
            if (move.captures && move.captures.length > 0) {
                tacticalValue += 150;
            }
        }
        
        // Check for forking moves
        const afterMove = makeMove(position, move);
        const newThreats = getAvailableCaptures(afterMove);
        
        if (newThreats.length >= 2) {
            // Count unique targets
            const targets = new Set();
            newThreats.forEach(threat => {
                threat.captures.forEach(cap => {
                    targets.add(`${cap.row},${cap.col}`);
                });
            });
            
            if (targets.size >= 2) {
                tacticalValue += 100 * targets.size; // Fork value
            }
        }
        
        // Check for discovered attacks
        if (createsDiscoveredAttack(ai, position, move)) {
            tacticalValue += 150;
        }
        
        // Check for sacrificial breakthrough
        if (isSacrificialBreakthrough(ai, position, move)) {
            tacticalValue += 300;
        }
        
        if (tacticalValue > 100) {
            tacticalMoves.push({
                move,
                value: tacticalValue,
                type: categorizeTacticalMove(move, tacticalValue)
            });
        }
    }
    
    // Sort by tactical value
    tacticalMoves.sort((a, b) => b.value - a.value);
    
    return tacticalMoves;
}

/**
 * Detects combination opportunities
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @param {number} depth - How deep to search
 * @returns {Array} Array of combination sequences
 */
export function findCombinations(ai, position, depth = 6) {
    const combinations = [];
    const captures = getAvailableCaptures(position);
    
    for (const firstMove of captures) {
        if (firstMove.captures.length >= 2) {
            // Already a combination start
            const combo = traceCombination(ai, position, firstMove, depth);
            if (combo.totalGain > 200) {
                combinations.push(combo);
            }
        }
    }
    
    return combinations;
}

/**
 * Evaluates breakthrough potential
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @param {Object} piece - Piece to evaluate
 * @returns {number} Breakthrough score
 */
export function evaluateBreakthroughPotential(ai, position, piece) {
    const { row, col } = piece;
    const pieceType = position.pieces[row][col];
    
    if (pieceType === PIECE.NONE) return 0;
    
    const isWhite = pieceType === PIECE.WHITE || pieceType === PIECE.WHITE_KING;
    const isKing = pieceType === PIECE.WHITE_KING || pieceType === PIECE.BLACK_KING;
    
    if (isKing) return 0; // Kings don't need breakthrough
    
    let score = 0;
    const promotionRow = isWhite ? 0 : 9;
    const distance = Math.abs(row - promotionRow);
    
    // Base score inversely proportional to distance
    score = (10 - distance) * 10;
    
    // Check if path is clear
    const direction = isWhite ? -1 : 1;
    let obstacles = 0;
    let r = row + direction;
    
    while (r !== promotionRow && r >= 0 && r < BOARD_SIZE) {
        // Check if any enemy pieces block the path
        for (let c = 0; c < BOARD_SIZE; c++) {
            const p = position.pieces[r][c];
            if (p !== PIECE.NONE && isPlayerPiece(p, isWhite ? PLAYER.BLACK : PLAYER.WHITE)) {
                obstacles++;
            }
        }
        r += direction;
    }
    
    // Reduce score based on obstacles
    score -= obstacles * 20;
    
    // Bonus for advanced pieces
    if (distance <= 3) {
        score += 50;
    }
    
    return Math.max(0, score);
}

/**
 * Detects pins and skewers
 * @param {Object} ai - AI instance
 * @param {Object} position - Current position
 * @returns {Array} Array of pinned pieces with their pinners
 */
export function detectPinsAndSkewers(ai, position) {
    const pins = [];
    const player = position.currentPlayer;
    const opponent = player === PLAYER.WHITE ? PLAYER.BLACK : PLAYER.WHITE;
    
    // Check each friendly piece
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = position.pieces[r][c];
            if (!isPlayerPiece(piece, player)) continue;
            
            // Check if removing this piece exposes another
            const testPos = { ...position };
            testPos.pieces[r][c] = PIECE.NONE;
            testPos.currentPlayer = opponent;
            
            const captures = getAvailableCaptures(testPos);
            
            for (const cap of captures) {
                // Check if this capture hits a more valuable piece
                const exposedPieces = cap.captures.filter(target => 
                    target.row !== r || target.col !== c
                );
                
                if (exposedPieces.length > 0) {
                    const pinnedValue = getPieceValue(piece);
                    const exposedValue = Math.max(...exposedPieces.map(ep => 
                        getPieceValue(position.pieces[ep.row][ep.col])
                    ));
                    
                    if (exposedValue > pinnedValue) {
                        pins.push({
                            pinned: { row: r, col: c, value: pinnedValue },
                            exposed: exposedPieces[0],
                            exposedValue,
                            pinner: { row: cap.from.row, col: cap.from.col }
                        });
                    }
                }
            }
        }
    }
    
    return pins;
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

function evaluateCapturePositional(position, move) {
    let bonus = 0;
    
    // Bonus for captures that open lines
    const afterMove = makeMove(position, move);
    const mobility = generateMoves(afterMove).length;
    bonus += mobility * 2;
    
    // Bonus for captures near promotion
    const piece = position.pieces[move.from.row][move.from.col];
    const isWhite = piece === PIECE.WHITE || piece === PIECE.WHITE_KING;
    const promotionRow = isWhite ? 0 : 9;
    const distanceToPromotion = Math.abs(move.to.row - promotionRow);
    
    if (distanceToPromotion <= 2) {
        bonus += (3 - distanceToPromotion) * 20;
    }
    
    // Penalty for captures that expose our pieces
    const ourExposedPieces = countExposedPieces(afterMove, position.currentPlayer);
    bonus -= ourExposedPieces * 15;
    
    return bonus;
}

function createsDiscoveredAttack(ai, position, move) {
    const afterMove = makeMove(position, move);
    const capturesBefore = getAvailableCaptures(position);
    const capturesAfter = getAvailableCaptures(afterMove);
    
    // Check if new captures appeared that don't involve the moved piece
    const newCaptures = capturesAfter.filter(cap => 
        cap.from.row !== move.to.row || cap.from.col !== move.to.col
    );
    
    return newCaptures.length > capturesBefore.length;
}

function isSacrificialBreakthrough(ai, position, move) {
    const piece = position.pieces[move.from.row][move.from.col];
    const isWhite = piece === PIECE.WHITE || piece === PIECE.WHITE_KING;
    const promotionRow = isWhite ? 0 : 9;
    
    // Check if move gets us very close to promotion
    if (Math.abs(move.to.row - promotionRow) <= 1) {
        // Check if we can be captured
        const afterMove = makeMove(position, move);
        afterMove.currentPlayer = position.currentPlayer === PLAYER.WHITE ? PLAYER.BLACK : PLAYER.WHITE;
        
        const responses = getAvailableCaptures(afterMove);
        const canBeCaptured = responses.some(r => 
            r.captures.some(cap => cap.row === move.to.row && cap.col === move.to.col)
        );
        
        // If we can be captured but opponent has no good follow-up, it's a sacrifice
        if (canBeCaptured) {
            // Simulate the capture
            for (const response of responses) {
                const afterCapture = makeMove(afterMove, response);
                afterCapture.currentPlayer = position.currentPlayer;
                
                // Check if we have a promotion threat
                const ourMoves = generateMoves(afterCapture);
                const hasPromotion = ourMoves.some(m => {
                    const p = afterCapture.pieces[m.from.row][m.from.col];
                    return shouldPromote(p, m.to.row);
                });
                
                if (hasPromotion) return true;
            }
        }
    }
    
    return false;
}

function categorizeTacticalMove(move, value) {
    if (move.captures && move.captures.length >= 3) return 'combination';
    if (move.captures && move.captures.length === 2) return 'double_capture';
    if (value >= 300) return 'breakthrough';
    if (value >= 200) return 'promotion_tactic';
    return 'tactical_shot';
}

function traceCombination(ai, position, firstMove, depth) {
    let totalGain = countCaptureValue(position, firstMove);
    const moves = [firstMove];
    let currentPos = makeMove(position, firstMove);
    let currentDepth = 1;
    
    while (currentDepth < depth) {
        const captures = getAvailableCaptures(currentPos);
        if (captures.length === 0) break;
        
        // Pick best continuation
        let bestCapture = null;
        let bestValue = -Infinity;
        
        for (const cap of captures) {
            const value = evaluateCaptureSequence(ai, currentPos, cap);
            if (value > bestValue) {
                bestValue = value;
                bestCapture = cap;
            }
        }
        
        if (!bestCapture || bestValue <= 0) break;
        
        moves.push(bestCapture);
        totalGain += countCaptureValue(currentPos, bestCapture);
        currentPos = makeMove(currentPos, bestCapture);
        currentDepth++;
    }
    
    return {
        moves,
        totalGain,
        depth: moves.length
    };
}

function countExposedPieces(position, player) {
    let exposed = 0;
    
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = position.pieces[r][c];
            if (isPlayerPiece(piece, player)) {
                // Simple check - is piece undefended and attackable?
                const hasDefender = hasAdjacentDefender(position, r, c, player);
                const canBeAttacked = canPieceBeAttacked(position, r, c, player);
                
                if (!hasDefender && canBeAttacked) {
                    exposed++;
                }
            }
        }
    }
    
    return exposed;
}

function hasAdjacentDefender(position, row, col, player) {
    const dirs = DIRECTIONS.KING_MOVES;
    
    for (const dir of dirs) {
        const r = row + dir.dy;
        const c = col + dir.dx;
        
        if (isValidSquare(r, c)) {
            const neighbor = position.pieces[r][c];
            if (isPlayerPiece(neighbor, player)) {
                return true;
            }
        }
    }
    
    return false;
}

function canPieceBeAttacked(position, row, col, player) {
    const opponent = player === PLAYER.WHITE ? PLAYER.BLACK : PLAYER.WHITE;
    const testPos = { ...position, currentPlayer: opponent };
    
    const captures = getAvailableCaptures(testPos);
    return captures.some(cap => 
        cap.captures.some(target => target.row === row && target.col === col)
    );
}