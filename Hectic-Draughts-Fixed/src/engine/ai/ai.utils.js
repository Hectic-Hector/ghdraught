/**
 * AI Utilities Module - Core functions for move generation and board operations
 * Extracted and enhanced from the original GrandmasterAI
 * @module ai.utils
 */

import { BOARD_SIZE, PIECE, PLAYER, DIRECTIONS, isDarkSquare } from '../constants.js';

/**
 * Makes a move on the position and returns new position
 * @param {Object} position - Current position
 * @param {Object} move - Move to make
 * @returns {Object} New position after move
 */
export function makeMove(position, move) {
    const newPosition = {
        pieces: position.pieces.map(row => [...row]),
        currentPlayer: position.currentPlayer === PLAYER.WHITE ? PLAYER.BLACK : PLAYER.WHITE,
        history: position.history || []
    };
    
    const piece = newPosition.pieces[move.from.row][move.from.col];
    newPosition.pieces[move.from.row][move.from.col] = PIECE.NONE;
    newPosition.pieces[move.to.row][move.to.col] = piece;
    
    // Handle captures
    if (move.captures) {
        move.captures.forEach(cap => {
            newPosition.pieces[cap.row][cap.col] = PIECE.NONE;
        });
    }
    
    // Handle promotion
    if (shouldPromote(piece, move.to.row)) {
        newPosition.pieces[move.to.row][move.to.col] = 
            piece === PIECE.WHITE ? PIECE.WHITE_KING : PIECE.BLACK_KING;
    }
    
    return newPosition;
}

/**
 * Generates all legal moves for the current position
 * @param {Object} position - Current position
 * @returns {Array} Array of legal moves
 */
export function generateMoves(position) {
    const captures = getAvailableCaptures(position);
    if (captures.length > 0) return captures;
    
    const normalMoves = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (isPieceOfCurrentPlayer(position.pieces[r][c], position.currentPlayer)) {
                addNormalMovesForPiece(normalMoves, position, r, c);
            }
        }
    }
    return normalMoves;
}

/**
 * Gets all available captures for current player
 * @param {Object} position - Current position
 * @returns {Array} Array of capture moves
 */
export function getAvailableCaptures(position) {
    let allCaptures = [];
    
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (isPieceOfCurrentPlayer(position.pieces[r][c], position.currentPlayer)) {
                findCaptureSequences(
                    allCaptures, 
                    position.pieces, 
                    {row: r, col: c}, 
                    [], 
                    [],
                    new Set(),
                    position.currentPlayer
                );
            }
        }
    }
    
    // In draughts, if captures exist, we must take the maximum
    if (allCaptures.length > 0) {
        allCaptures.sort((a, b) => b.captures.length - a.captures.length);
        const maxLength = allCaptures[0].captures.length;
        return allCaptures.filter(move => move.captures.length === maxLength);
    }
    
    return [];
}

/**
 * Recursively finds all capture sequences from a position
 */
export function findCaptureSequences(sequences, pieces, currentPos, path, capturedSoFar, visitedPositions, currentPlayer, recursionDepth = 0) {
    if (recursionDepth > 20) return;
    
    const posKey = `${currentPos.row},${currentPos.col}`;
    if (visitedPositions.has(posKey)) return;
    
    visitedPositions.add(posKey);
    
    let foundJump = false;
    const piece = pieces[currentPos.row][currentPos.col];
    const isKing = piece === PIECE.WHITE_KING || piece === PIECE.BLACK_KING;
    const dirs = DIRECTIONS.KING_MOVES;

    for (const dir of dirs) {
        if (isKing) {
            // Flying king captures
            let checkRow = currentPos.row + dir.dy;
            let checkCol = currentPos.col + dir.dx;
            let enemyPos = null;
            
            while (isValidSquare(checkRow, checkCol)) {
                const checkPiece = pieces[checkRow][checkCol];
                
                if (checkPiece !== PIECE.NONE) {
                    if (isOpponentPiece(checkPiece, currentPlayer)) {
                        enemyPos = { row: checkRow, col: checkCol };
                        break;
                    } else {
                        break; // Blocked by own piece
                    }
                }
                
                checkRow += dir.dy;
                checkCol += dir.dx;
            }
            
            if (enemyPos && !capturedSoFar.some(p => p.row === enemyPos.row && p.col === enemyPos.col)) {
                // Check landing squares
                let landRow = enemyPos.row + dir.dy;
                let landCol = enemyPos.col + dir.dx;
                
                while (isValidSquare(landRow, landCol) && pieces[landRow][landCol] === PIECE.NONE) {
                    foundJump = true;
                    
                    // Make the capture on a copy
                    const newPieces = pieces.map(row => [...row]);
                    newPieces[currentPos.row][currentPos.col] = PIECE.NONE;
                    newPieces[enemyPos.row][enemyPos.col] = PIECE.NONE;
                    newPieces[landRow][landCol] = piece;
                    
                    const newVisitedPositions = new Set(visitedPositions);
                    findCaptureSequences(
                        sequences, 
                        newPieces, 
                        { row: landRow, col: landCol }, 
                        [...path, currentPos], 
                        [...capturedSoFar, enemyPos],
                        newVisitedPositions,
                        currentPlayer,
                        recursionDepth + 1
                    );
                    
                    landRow += dir.dy;
                    landCol += dir.dx;
                }
            }
        } else {
            // Regular piece captures (men)
            const jumpOverPos = { row: currentPos.row + dir.dy, col: currentPos.col + dir.dx };
            const landPos = { row: currentPos.row + 2 * dir.dy, col: currentPos.col + 2 * dir.dx };

            if (isValidSquare(landPos.row, landPos.col) && 
                pieces[landPos.row][landPos.col] === PIECE.NONE && 
                isOpponentPiece(pieces[jumpOverPos.row][jumpOverPos.col], currentPlayer)) {
                
                const alreadyCaptured = capturedSoFar.some(p => 
                    p.row === jumpOverPos.row && p.col === jumpOverPos.col);
                
                if (!alreadyCaptured) {
                    foundJump = true;
                    
                    const newPieces = pieces.map(row => [...row]);
                    newPieces[currentPos.row][currentPos.col] = PIECE.NONE;
                    newPieces[jumpOverPos.row][jumpOverPos.col] = PIECE.NONE;
                    newPieces[landPos.row][landPos.col] = piece;

                    const newVisitedPositions = new Set(visitedPositions);
                    findCaptureSequences(
                        sequences, 
                        newPieces, 
                        landPos, 
                        [...path, currentPos], 
                        [...capturedSoFar, jumpOverPos],
                        newVisitedPositions,
                        currentPlayer,
                        recursionDepth + 1
                    );
                }
            }
        }
    }

    // If no more jumps found, record the sequence
    if (!foundJump && capturedSoFar.length > 0) {
        sequences.push({ 
            from: path[0] || currentPos, 
            to: currentPos, 
            captures: capturedSoFar 
        });
    }
    
    visitedPositions.delete(posKey);
}

/**
 * Adds normal (non-capture) moves for a piece
 */
export function addNormalMovesForPiece(moves, position, r, c) {
    const piece = position.pieces[r][c];
    const isKing = piece === PIECE.WHITE_KING || piece === PIECE.BLACK_KING;
    
    if (isKing) {
        // Flying king movement
        const dirs = DIRECTIONS.KING_MOVES;
        
        for (const d of dirs) {
            let nr = r + d.dy;
            let nc = c + d.dx;
            
            while (isValidSquare(nr, nc) && position.pieces[nr][nc] === PIECE.NONE && isDarkSquare(nr, nc)) {
                moves.push({ 
                    from: { row: r, col: c }, 
                    to: { row: nr, col: nc }, 
                    captures: [] 
                });
                
                nr += d.dy;
                nc += d.dx;
            }
        }
    } else {
        // Regular piece movement
        const dirs = position.currentPlayer === PLAYER.WHITE ? 
            DIRECTIONS.WHITE_MOVES : DIRECTIONS.BLACK_MOVES;
        
        for (const d of dirs) {
            const nr = r + d.dy;
            const nc = c + d.dx;
            if (isValidSquare(nr, nc) && position.pieces[nr][nc] === PIECE.NONE && isDarkSquare(nr, nc)) {
                moves.push({ 
                    from: { row: r, col: c }, 
                    to: { row: nr, col: nc }, 
                    captures: [] 
                });
            }
        }
    }
}

/**
 * Gets captures available from a specific piece
 */
export function getPieceCapturesFrom(position, piecePos) {
    const captures = [];
    const player = position.pieces[piecePos.row][piecePos.col] === PIECE.WHITE || 
                   position.pieces[piecePos.row][piecePos.col] === PIECE.WHITE_KING ? 
                   PLAYER.WHITE : PLAYER.BLACK;
    
    findCaptureSequences(
        captures, 
        position.pieces, 
        piecePos, 
        [], 
        [],
        new Set(),
        player
    );
    
    return captures;
}

/**
 * Checks if a piece should be promoted
 */
export function shouldPromote(piece, row) {
    return (piece === PIECE.WHITE && row === 0) || 
           (piece === PIECE.BLACK && row === BOARD_SIZE - 1);
}

/**
 * Converts move to notation
 */
export function getMoveNotation(move) {
    if (!move || !move.from || !move.to) return '--';
    
    // For now, simple coordinate notation
    // Could be enhanced to use standard draughts notation
    const from = `${move.from.row},${move.from.col}`;
    const to = `${move.to.row},${move.to.col}`;
    return move.captures && move.captures.length > 0 ? 
        `${from}x${to}` : `${from}-${to}`;
}

/**
 * Checks if square is valid
 */
export function isValidSquare(row, col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

/**
 * Checks if a piece belongs to the current player
 */
export function isPieceOfCurrentPlayer(piece, currentPlayer) {
    return currentPlayer === PLAYER.WHITE ? 
        (piece === PIECE.WHITE || piece === PIECE.WHITE_KING) : 
        (piece === PIECE.BLACK || piece === PIECE.BLACK_KING);
}

/**
 * Checks if a piece belongs to the opponent
 */
export function isOpponentPiece(piece, currentPlayer) {
    return currentPlayer === PLAYER.WHITE ? 
        (piece === PIECE.BLACK || piece === PIECE.BLACK_KING) : 
        (piece === PIECE.WHITE || piece === PIECE.WHITE_KING);
}

/**
 * Checks if a piece belongs to a specific player
 */
export function isPlayerPiece(piece, player) {
    return player === PLAYER.WHITE ? 
        (piece === PIECE.WHITE || piece === PIECE.WHITE_KING) : 
        (piece === PIECE.BLACK || piece === PIECE.BLACK_KING);
}

/**
 * Counts total pieces on board
 */
export function countTotalPieces(position) {
    let count = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (position.pieces[r][c] !== PIECE.NONE) count++;
        }
    }
    return count;
}

/**
 * Gets piece counts by type
 */
export function getPieceCounts(position) {
    const counts = {
        [PLAYER.WHITE]: { men: 0, kings: 0, total: 0 },
        [PLAYER.BLACK]: { men: 0, kings: 0, total: 0 }
    };
    
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = position.pieces[r][c];
            switch (piece) {
                case PIECE.WHITE:
                    counts[PLAYER.WHITE].men++;
                    counts[PLAYER.WHITE].total++;
                    break;
                case PIECE.WHITE_KING:
                    counts[PLAYER.WHITE].kings++;
                    counts[PLAYER.WHITE].total++;
                    break;
                case PIECE.BLACK:
                    counts[PLAYER.BLACK].men++;
                    counts[PLAYER.BLACK].total++;
                    break;
                case PIECE.BLACK_KING:
                    counts[PLAYER.BLACK].kings++;
                    counts[PLAYER.BLACK].total++;
                    break;
            }
        }
    }
    
    return counts;
}

/**
 * Checks if position has any captures available
 */
export function hasCaptures(position) {
    return getAvailableCaptures(position).length > 0;
}

/**
 * Gets game phase based on piece count
 */
export function getGamePhase(position) {
    const totalPieces = countTotalPieces(position);
    if (totalPieces > 16) return 'opening';
    if (totalPieces > 10) return 'middlegame';
    return 'endgame';
}