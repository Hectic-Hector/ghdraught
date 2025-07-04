/**
 * FEN (Forsyth–Edwards Notation) Parser for International Draughts
 * @author codewithheck
 * Created: 2025-06-16 20:40:12 UTC
 */

import { PIECE, PLAYER, BOARD_SIZE, SQUARE_NUMBERS } from '../engine/constants.js';

/**
 * Validates a FEN string
 * @param {string} fen - FEN string to validate
 * @returns {boolean}
 */
export function validateFEN(fen) {
    // Basic format check
    if (!/^[WB]:[WB][\d,K]*:[WB][\d,K]*$/.test(fen)) {
        return false;
    }

    const [player, white, black] = fen.split(':');

    // Validate player
    if (player !== 'W' && player !== 'B') {
        return false;
    }

    // Validate piece sections
    if (!validatePieceSection(white, 'W') || !validatePieceSection(black, 'B')) {
        return false;
    }

    // Validate no piece overlapping
    const whiteSquares = extractSquareNumbers(white);
    const blackSquares = extractSquareNumbers(black);
    if (hasOverlappingSquares(whiteSquares, blackSquares)) {
        return false;
    }

    return true;
}

/**
 * Validates a piece section of FEN string
 * @param {string} section - Piece section to validate
 * @param {string} color - Expected color (W or B)
 * @returns {boolean}
 */
function validatePieceSection(section, color) {
    if (!section.startsWith(color)) {
        return false;
    }

    // Empty section is valid
    if (section.length === 1) {
        return true;
    }

    const pieces = section.substring(1).split(',');
    const validSquares = new Set(SQUARE_NUMBERS.filter(n => n !== 0));

    for (const piece of pieces) {
        if (!piece) continue;

        // Check for valid format (number + optional K)
        if (!/^\d+K?$/.test(piece)) {
            return false;
        }

        // Extract square number
        const number = parseInt(piece.replace('K', ''));

        // Validate square number
        if (!validSquares.has(number)) {
            return false;
        }

        // Remove used square
        validSquares.delete(number);
    }

    return true;
}

/**
 * Extracts square numbers from a piece section
 * @param {string} section - Piece section
 * @returns {Set<number>}
 */
function extractSquareNumbers(section) {
    const numbers = new Set();
    if (section.length > 1) {
        section.substring(1).split(',').forEach(piece => {
            if (piece) {
                numbers.add(parseInt(piece.replace('K', '')));
            }
        });
    }
    return numbers;
}

/**
 * Checks if two sets of squares have overlapping values
 * @param {Set<number>} set1 - First set of squares
 * @param {Set<number>} set2 - Second set of squares
 * @returns {boolean}
 */
function hasOverlappingSquares(set1, set2) {
    for (const num of set1) {
        if (set2.has(num)) {
            return true;
        }
    }
    return false;
}

/**
 * Parses a FEN string into a board position (with robust error handling)
 * @param {string} fen - FEN string to parse
 * @returns {Object} Position object
 * @throws {Error} If FEN is invalid or malformed
 */
export function parseFEN(fen) {
    if (typeof fen !== 'string' || !fen.trim()) {
        throw new Error('FEN must be a non-empty string');
    }

    const parts = fen.trim().split(':');
    if (parts.length !== 3) {
        throw new Error('FEN must have three sections: player, white, black (separated by colons)');
    }
    const [player, white, black] = parts;

    if (player !== 'W' && player !== 'B') {
        throw new Error('Current player must be "W" or "B"');
    }

    if (!validateFEN(fen)) {
        throw new Error('Invalid FEN string');
    }

    const position = {
        pieces: Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(PIECE.NONE)),
        currentPlayer: player === 'W' ? PLAYER.WHITE : PLAYER.BLACK
    };

    try {
        // Place white pieces
        if (white.length > 1) {
            placePieces(position.pieces, white.substring(1), true);
        }
        // Place black pieces
        if (black.length > 1) {
            placePieces(position.pieces, black.substring(1), false);
        }
    } catch (e) {
        throw new Error('Error while placing pieces from FEN: ' + e.message);
    }

    return position;
}

/**
 * Places pieces on the board from a piece section
 * @param {Array<Array<number>>} board - Board array
 * @param {string} section - Piece section
 * @param {boolean} isWhite - Whether pieces are white
 */
function placePieces(board, section, isWhite) {
    section.split(',').forEach(piece => {
        if (!piece) return;

        const isKing = piece.endsWith('K');
        const number = parseInt(isKing ? piece.slice(0, -1) : piece);
        const position = getPositionFromNumber(number);

        board[position.row][position.col] = isWhite ?
            (isKing ? PIECE.WHITE_KING : PIECE.WHITE) :
            (isKing ? PIECE.BLACK_KING : PIECE.BLACK);
    });
}

/**
 * Gets board position from square number
 * @param {number} number - Square number
 * @returns {Object} Position object
 */
function getPositionFromNumber(number) {
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (SQUARE_NUMBERS[row * BOARD_SIZE + col] === number) {
                return { row, col };
            }
        }
    }
    throw new Error(`Invalid square number: ${number}`);
}

/**
 * Generates a FEN string from a board position
 * @param {Object} position - Position object
 * @returns {string} FEN string
 */
export function generateFEN(position) {
    let white = ['W'];
    let black = ['B'];

    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const squareNum = SQUARE_NUMBERS[row * BOARD_SIZE + col];
            if (squareNum === 0) continue;

            const piece = position.pieces[row][col];
            switch (piece) {
                case PIECE.WHITE:
                    white.push(squareNum.toString());
                    break;
                case PIECE.WHITE_KING:
                    white.push(`${squareNum}K`);
                    break;
                case PIECE.BLACK:
                    black.push(squareNum.toString());
                    break;
                case PIECE.BLACK_KING:
                    black.push(`${squareNum}K`);
                    break;
            }
        }
    }

    // Sort numbers for consistent output
    white = white.slice(0, 1).concat(white.slice(1).sort((a, b) => {
        return parseInt(a) - parseInt(b);
    }));
    black = black.slice(0, 1).concat(black.slice(1).sort((a, b) => {
        return parseInt(a) - parseInt(b);
    }));

    return `${position.currentPlayer === PLAYER.WHITE ? 'W' : 'B'}:${white.join(',')}:${black.join(',')}`;
}
