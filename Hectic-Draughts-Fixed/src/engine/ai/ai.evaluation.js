/**
 * AI Evaluation Module - Advanced position evaluation for ruthless play
 * @module ai.evaluation
 */

import { PIECE, PLAYER, BOARD_SIZE } from '../constants.js';
import { 
    countTotalPieces, 
    getPieceCounts, 
    getGamePhase,
    isPieceOfCurrentPlayer,
    isPlayerPiece,
    isValidSquare 
} from './ai.utils.js';

// Helper: Mirror column for flipped board (col 0 is left, col 9 is right)
const FLIP_COL = col => 9 - col;

// Piece base values
const PIECE_VALUES = {
    MAN: 100,
    KING: 450
};

// Positional value tables for a STANDARD board (White's perspective).
// Our code will flip the column index at lookup time to match our flipped board.
const MAN_PST = [
    [  0,  30,   0,  30,   0,  30,   0,  30,   0,  30],
    [ 25,   0,  28,   0,  28,   0,  28,   0,  28,   0],
    [  0,  22,   0,  25,   0,  25,   0,  25,   0,  22],
    [ 20,   0,  23,   0,  26,   0,  26,   0,  23,   0],
    [  0,  18,   0,  20,   0,  20,   0,  20,   0,  18],
    [ 15,   0,  17,   0,  17,   0,  17,   0,  17,   0],
    [  0,  10,   0,  12,   0,  12,   0,  12,   0,  10],
    [  5,   0,   8,   0,   8,   0,   8,   0,   8,   0],
    [  0,   0,   0,   5,   0,   5,   0,   5,   0,   0],
    [ -5,   0,  -5,   0,  -5,   0,  -5,   0,  -5,   0]
];

const KING_PST = [
    [ -5,   0,  -5,   0,  -5,   0,  -5,   0,  -5,   0],
    [  0,   5,   0,  10,   0,  10,   0,  10,   0,   5],
    [ -5,   0,  15,   0,  20,   0,  20,   0,  15,   0],
    [  0,  10,   0,  25,   0,  30,   0,  25,   0,  10],
    [ -5,   0,  20,   0,  35,   0,  35,   0,  20,   0],
    [  0,  10,   0,  25,   0,  30,   0,  25,   0,  10],
    [ -5,   0,  15,   0,  20,   0,  20,   0,  15,   0],
    [  0,   5,   0,  10,   0,  10,   0,  10,   0,   5],
    [ -5,   0,  -5,   0,  -5,   0,  -5,   0,  -5,   0],
    [-10,   0, -10,   0, -10,   0, -10,   0, -10,   0]
];

/**
 * Main evaluation function - returns score from current player's perspective
 */
export function evaluatePosition(ai, position) {
    const cacheKey = ai.cache.generateKey(position);
    if (ai.evalCache.has(cacheKey)) {
        return ai.evalCache.get(cacheKey);
    }

    let score = 0;
    const pieces = {
        white: [], 
        black: [],
        whiteKings: 0,
        blackKings: 0,
        whiteMen: 0,
        blackMen: 0
    };

    // Collect pieces and material
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = position.pieces[r][c];
            if (piece === PIECE.NONE) continue;
            
            const pieceInfo = { row: r, col: c, piece: piece };
            const isWhite = piece === PIECE.WHITE || piece === PIECE.WHITE_KING;
            const isKing = piece === PIECE.WHITE_KING || piece === PIECE.BLACK_KING;
            
            if (isWhite) {
                pieces.white.push(pieceInfo);
                if (isKing) pieces.whiteKings++;
                else pieces.whiteMen++;
            } else {
                pieces.black.push(pieceInfo);
                if (isKing) pieces.blackKings++;
                else pieces.blackMen++;
            }
        }
    }

    // Check for won positions
    if (pieces.white.length === 0) return position.currentPlayer === PLAYER.BLACK ? 10000 : -10000;
    if (pieces.black.length === 0) return position.currentPlayer === PLAYER.WHITE ? 10000 : -10000;

    const gamePhase = getGamePhase(position);
    const whiteMaterial = pieces.whiteMen * PIECE_VALUES.MAN + pieces.whiteKings * PIECE_VALUES.KING;
    const blackMaterial = pieces.blackMen * PIECE_VALUES.MAN + pieces.blackKings * PIECE_VALUES.KING;
    score = whiteMaterial - blackMaterial;

    // Use FLIPPED logic for PST and bonuses
    pieces.white.forEach(p => {
        score += evaluatePiecePositionFlipped(p, true, gamePhase);
    });
    pieces.black.forEach(p => {
        score -= evaluatePiecePositionFlipped(p, false, gamePhase);
    });

    // [rest of function unchanged...]
    const mobility = evaluateMobilityDifferential(ai, position);
    const threats = evaluateTacticalThreats(ai, position, pieces);
    const control = evaluateStrategicControl(position, gamePhase, pieces);
    const formations = evaluateFormations(position, pieces);
    const threatMaps = generateThreatMaps(ai, position, pieces);
    const heatmapScore = evaluateHeatmaps(position, pieces, threatMaps);
    let endgameScore = 0;
    if (gamePhase === 'endgame') {
        endgameScore = evaluateEndgame(position, pieces);
    }
    const weights = getPhaseWeights(gamePhase);
    score += mobility * weights.mobility;
    score += threats * weights.tactics;
    score += control * weights.control;
    score += formations * weights.formations;
    score += heatmapScore * weights.threats;
    score += endgameScore * weights.endgame;
    score += position.currentPlayer === PLAYER.WHITE ? 10 : -10;
    const finalScore = position.currentPlayer === PLAYER.WHITE ? score : -score;
    ai.evalCache.set(cacheKey, finalScore);
    return finalScore;
}

/**
 * Evaluates a single piece's positional value (FLIPPED for horizontal mirror)
 */
function evaluatePiecePositionFlipped(pieceInfo, isWhite, gamePhase) {
    const row = pieceInfo.row;
    const col = pieceInfo.col;
    const piece = pieceInfo.piece;
    const isKing = piece === PIECE.WHITE_KING || piece === PIECE.BLACK_KING;
    let score = 0;
    const mirroredCol = FLIP_COL(col);

    if (isKing) {
        // Centralization: mirror col for true center
        score += isWhite ? KING_PST[row][mirroredCol] : KING_PST[9 - row][mirroredCol];
        if (gamePhase === 'endgame') {
            const centerDist = Math.abs(row - 4.5) + Math.abs(mirroredCol - 4.5);
            score += (15 - centerDist) * 2;
        }
    } else {
        score += isWhite ? MAN_PST[row][mirroredCol] : MAN_PST[9 - row][mirroredCol];
        // Advancement bonuses
        if (isWhite) {
            score += row * 3;
            if (row >= 7) score += 20;
            if (row === 8) score += 30;
        } else {
            score += (9 - row) * 3;
            if (row <= 2) score += 20;
            if (row === 1) score += 30;
        }
    }

    // Edge penalty for men
    if (!isKing && (row === 0 || row === 9 || col === 0 || col === 9)) {
        score -= 5;
    }

    return score;
}

// ... rest of the file remains unchanged ...

/**
 * Evaluates mobility differential
 */
export function evaluateMobilityDifferential(ai, position) {
    // Our mobility
    const ourMoves = ai.generateMoves(position).length;
    
    // Opponent mobility (switch sides)
    const oppPosition = {
        pieces: position.pieces,
        currentPlayer: position.currentPlayer === PLAYER.WHITE ? PLAYER.BLACK : PLAYER.WHITE
    };
    const theirMoves = ai.generateMoves(oppPosition).length;
    
    let score = (ourMoves - theirMoves) * 5;
    
    // Bonus for severely restricting opponent
    if (theirMoves <= 3) score += 30;
    if (theirMoves <= 1) score += 70;
    if (theirMoves === 0) score += 200;
    
    return score;
}

/**
 * Evaluates tactical threats and hanging pieces
 */
export function evaluateTacticalThreats(ai, position, pieces) {
    let score = 0;
    
    // Check white threats on black pieces
    pieces.black.forEach(target => {
        const attackers = countAttackersOn(ai, position, target, PLAYER.WHITE);
        const defenders = countDefendersOf(ai, position, target, PLAYER.BLACK);
        
        if (attackers > defenders) {
            const pieceValue = (target.piece === PIECE.BLACK_KING) ? 150 : 60;
            score += pieceValue * (attackers - defenders);
        }
    });
    
    // Check black threats on white pieces
    pieces.white.forEach(target => {
        const attackers = countAttackersOn(ai, position, target, PLAYER.BLACK);
        const defenders = countDefendersOf(ai, position, target, PLAYER.WHITE);
        
        if (attackers > defenders) {
            const pieceValue = (target.piece === PIECE.WHITE_KING) ? 150 : 60;
            score -= pieceValue * (attackers - defenders);
        }
    });
    
    // Fork detection
    score += detectForks(ai, position, pieces.white, PLAYER.WHITE) * 40;
    score -= detectForks(ai, position, pieces.black, PLAYER.BLACK) * 40;
    
    return score;
}

/**
 * Evaluates strategic control of key squares
 */
export function evaluateStrategicControl(position, gamePhase, pieces) {
    let score = 0;
    
    // Key central squares
    const keySquares = [
        {r: 4, c: 4, value: 10}, {r: 4, c: 5, value: 10},
        {r: 5, c: 4, value: 10}, {r: 5, c: 5, value: 10},
        {r: 3, c: 3, value: 7}, {r: 3, c: 6, value: 7},
        {r: 6, c: 3, value: 7}, {r: 6, c: 6, value: 7}
    ];
    
    keySquares.forEach(sq => {
        const piece = position.pieces[sq.r][sq.c];
        if (piece !== PIECE.NONE) {
            const isWhite = piece === PIECE.WHITE || piece === PIECE.WHITE_KING;
            const controlValue = sq.value * (gamePhase === 'middlegame' ? 1.5 : 1);
            score += isWhite ? controlValue : -controlValue;
        }
    });
    
    // Control of opponent's back rank
    for (let c = 0; c < BOARD_SIZE; c++) {
        if (position.pieces[0][c] === PIECE.WHITE || position.pieces[0][c] === PIECE.WHITE_KING) {
            score += 20; // White controls black's back rank
        }
        if (position.pieces[9][c] === PIECE.BLACK || position.pieces[9][c] === PIECE.BLACK_KING) {
            score -= 20; // Black controls white's back rank
        }
    }
    
    return score;
}

/**
 * Evaluates piece formations and structures
 */
function evaluateFormations(position, pieces) {
    let score = 0;
    
    score += getFormationScore(pieces.white) * 1.2;
    score -= getFormationScore(pieces.black) * 1.2;
    
    return score;
}

/**
 * Calculates formation bonuses for a set of pieces
 */
export function getFormationScore(pieces) {
    let score = 0;
    const positions = new Set(pieces.map(p => `${p.row},${p.col}`));
    
    for (const piece of pieces) {
        const row = piece.row;
        const col = piece.col;
        
        // Triangle formation (very strong)
        if (positions.has(`${row + 1},${col - 1}`) && 
            positions.has(`${row + 1},${col + 1}`)) {
            score += 15;
        }
        
        // Chain formation
        let chainLength = 1;
        let r = row + 1, c = col + 1;
        while (positions.has(`${r},${c}`)) {
            chainLength++;
            r++; c++;
        }
        if (chainLength >= 3) score += chainLength * 8;
        
        // Phalanx (side by side)
        if (positions.has(`${row},${col + 2}`) || 
            positions.has(`${row},${col - 2}`)) {
            score += 5;
        }
        
        // Protected piece bonus
        const protectedCount = countProtectors(positions, row, col);
        score += protectedCount * 6;
    }
    
    return score;
}

/**
 * Generates threat heatmaps for both sides
 */
export function getThreatHeatmap(position, enemyPieces, cacheKey) {
    const heat = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
    
    for (const enemy of enemyPieces) {
        const threats = getThreatenedSquares(position, enemy);
        threats.forEach((threat) => {
            if (isValidSquare(threat.row, threat.col)) {
                heat[threat.row][threat.col] += threat.value;
            }
        });
    }
    
    return heat;
}

/**
 * Generates threat maps for evaluation
 */
function generateThreatMaps(ai, position, pieces) {
    const whiteHeat = getThreatHeatmap(position, pieces.white, 'white_heat');
    const blackHeat = getThreatHeatmap(position, pieces.black, 'black_heat');
    
    return { whiteHeat: whiteHeat, blackHeat: blackHeat };
}

/**
 * Evaluates position based on threat heatmaps
 */
function evaluateHeatmaps(position, pieces, threatMaps) {
    let score = 0;
    
    // Penalty for pieces under threat
    pieces.white.forEach(p => {
        const threat = threatMaps.blackHeat[p.row][p.col];
        if (threat > 0) {
            score -= threat * 3;
        }
    });
    
    pieces.black.forEach(p => {
        const threat = threatMaps.whiteHeat[p.row][p.col];
        if (threat > 0) {
            score += threat * 3;
        }
    });
    
    return score;
}

/**
 * Special endgame evaluation
 */
function evaluateEndgame(position, pieces) {
    let score = 0;
    const totalPieces = pieces.white.length + pieces.black.length;
    
    // King vs King endgames
    if (pieces.whiteMen === 0 && pieces.blackMen === 0) {
        // More kings usually win
        const kingDiff = pieces.whiteKings - pieces.blackKings;
        score += kingDiff * 200;
        
        // In equal king endgames, centralization matters
        if (Math.abs(kingDiff) <= 1) {
            pieces.white.forEach(p => {
                if (p.piece === PIECE.WHITE_KING) {
                    const centerDist = Math.abs(p.row - 4.5) + Math.abs(p.col - 4.5);
                    score += (15 - centerDist);
                }
            });
            
            pieces.black.forEach(p => {
                if (p.piece === PIECE.BLACK_KING) {
                    const centerDist = Math.abs(p.row - 4.5) + Math.abs(p.col - 4.5);
                    score -= (15 - centerDist);
                }
            });
        }
    }
    
    // Opposition and key squares
    if (totalPieces <= 6) {
        score += evaluateOpposition(position, pieces) * 50;
    }
    
    return score;
}

/**
 * Evaluates opposition in king endgames
 */
function evaluateOpposition(position, pieces) {
    // Simplified - checks if kings face each other with odd squares between
    if (pieces.whiteKings === 1 && pieces.blackKings === 1) {
        const whiteKing = pieces.white.find(p => p.piece === PIECE.WHITE_KING);
        const blackKing = pieces.black.find(p => p.piece === PIECE.BLACK_KING);
        
        if (whiteKing && blackKing) {
            const rowDiff = Math.abs(whiteKing.row - blackKing.row);
            const colDiff = Math.abs(whiteKing.col - blackKing.col);
            
            // Direct opposition
            if (rowDiff === 2 && colDiff === 0 || rowDiff === 0 && colDiff === 2) {
                return position.currentPlayer === PLAYER.WHITE ? 1 : -1;
            }
        }
    }
    return 0;
}

/**
 * Simulates opponent's best plan
 */
export function simulateOpponentPlan(position, opponentMoves) {
    let maxThreat = 0;
    
    for (const move of opponentMoves) {
        // Promotion threat
        const piece = position.pieces[move.from.row][move.from.col];
        if ((piece === PIECE.WHITE && move.to.row === 9) || 
            (piece === PIECE.BLACK && move.to.row === 0)) {
            maxThreat += 50;
        }
        
        // Multi-capture threat
        if (move.captures && move.captures.length >= 2) {
            maxThreat += 30 + move.captures.length * 15;
        }
        
        // Single capture threat
        if (move.captures && move.captures.length === 1) {
            maxThreat += 25;
        }
    }
    
    return maxThreat;
}

// Helper functions

function getPhaseWeights(gamePhase) {
    const weights = {
        opening: { mobility: 2.0, tactics: 1.0, control: 1.5, formations: 1.2, threats: 0.8, endgame: 0 },
        middlegame: { mobility: 1.5, tactics: 1.5, control: 1.2, formations: 1.0, threats: 1.2, endgame: 0 },
        endgame: { mobility: 0.8, tactics: 1.0, control: 0.8, formations: 0.5, threats: 0.6, endgame: 2.0 }
    };
    return weights[gamePhase];
}

function countAttackersOn(ai, position, target, attackingPlayer) {
    // Switch to attacking player's perspective
    const attackPos = {
        pieces: position.pieces,
        currentPlayer: attackingPlayer
    };
    
    const captures = ai.getAvailableCaptures(attackPos);
    return captures.filter(move => 
        move.captures.some(cap => cap.row === target.row && cap.col === target.col)
    ).length;
}

function countDefendersOf(ai, position, target, defendingPlayer) {
    let defenders = 0;
    const dirs = [
        { dy: -1, dx: -1 }, { dy: -1, dx: 1 },
        { dy: 1, dx: -1 }, { dy: 1, dx: 1 }
    ];
    
    for (const dir of dirs) {
        const r = target.row + dir.dy;
        const c = target.col + dir.dx;
        if (isValidSquare(r, c)) {
            const piece = position.pieces[r][c];
            if (isPlayerPiece(piece, defendingPlayer)) {
                defenders++;
            }
        }
    }
    
    return defenders;
}

function countProtectors(positions, row, col) {
    let count = 0;
    const dirs = [
        { dy: -1, dx: -1 }, { dy: -1, dx: 1 },
        { dy: 1, dx: -1 }, { dy: 1, dx: 1 }
    ];
    
    for (const dir of dirs) {
        if (positions.has(`${row + dir.dy},${col + dir.dx}`)) {
            count++;
        }
    }
    
    return count;
}

function detectForks(ai, position, pieces, player) {
    let forkCount = 0;
    
    // Simulate each piece's captures
    const testPos = {
        pieces: position.pieces,
        currentPlayer: player
    };
    const moves = ai.generateMoves(testPos);
    
    for (const move of moves) {
        if (move.captures && move.captures.length >= 2) {
            forkCount++;
        }
    }
    
    return forkCount;
}

function getThreatenedSquares(position, piece) {
    const threats = [];
    const isKing = piece.piece === PIECE.WHITE_KING || piece.piece === PIECE.BLACK_KING;
    const row = piece.row;
    const col = piece.col;
    
    const dirs = [
        { dy: -1, dx: -1 }, { dy: -1, dx: 1 },
        { dy: 1, dx: -1 }, { dy: 1, dx: 1 }
    ];
    
    for (const dir of dirs) {
        if (isKing) {
            // King threatens along diagonals
            let r = row + dir.dy;
            let c = col + dir.dx;
            let distance = 1;
            
            while (isValidSquare(r, c) && distance <= 7) {
                threats.push({ 
                    row: r, 
                    col: c, 
                    value: Math.max(5 - distance, 1) 
                });
                
                if (position.pieces[r][c] !== PIECE.NONE) break;
                
                r += dir.dy;
                c += dir.dx;
                distance++;
            }
        } else {
            // Man threatens adjacent squares
            const r = row + dir.dy;
            const c = col + dir.dx;
            if (isValidSquare(r, c)) {
                threats.push({ row: r, col: c, value: 3 });
            }
        }
    }
    
    return threats;
}

/**
 * Gets material-only evaluation
 */
export function evaluateMaterial(position) {
    let score = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = position.pieces[r][c];
            switch (piece) {
                case PIECE.WHITE: score += PIECE_VALUES.MAN; break;
                case PIECE.WHITE_KING: score += PIECE_VALUES.KING; break;
                case PIECE.BLACK: score -= PIECE_VALUES.MAN; break;
                case PIECE.BLACK_KING: score -= PIECE_VALUES.KING; break;
            }
        }
    }
    return score;
}
