/**
 * Global constants for the Hectic Draughts game - FLIPPED BOARD VERSION
 * - Fixed isDarkSquare function for horizontally flipped board
 * - All other enhancements from previous version maintained
 */

// Game Board
export const BOARD_SIZE = 10;

// Piece Types
export const PIECE = {
    NONE: 0,
    WHITE: 1,
    BLACK: 2,
    WHITE_KING: 3,
    BLACK_KING: 4
};

// Player Types
export const PLAYER = {
    WHITE: 1,
    BLACK: 2
};

// Game States
export const GAME_STATE = {
    ONGOING: 'ongoing',
    WHITE_WIN: 'whiteWin',
    BLACK_WIN: 'blackWin',
    DRAW: 'draw'
};

// Game Modes
export const GAME_MODE = {
    NORMAL: 'normal',
    EDIT: 'edit'
};

// Enhanced Piece Values for AI Evaluation
export const PIECE_VALUE = {
    [PIECE.NONE]: 0,
    [PIECE.WHITE]: 100,
    [PIECE.BLACK]: -100,
    [PIECE.WHITE_KING]: 350,
    [PIECE.BLACK_KING]: -350
};

// Enhanced Positional Values for Smarter AI
export const POSITION_VALUE = {
    CENTER: 7,
    EDGE: -5,
    PROMOTION: 30,
    KING_CENTRALITY: 12,
    MOBILITY: 2,
    BACK_RANK: 15,
    ADVANCEMENT: 2,
    TEMPO: 10,
    TRAPPED_PIECE: -50,
    PROTECTED_PIECE: 10,
    HANGING_PIECE: -30,
    BRIDGE_PATTERN: 20,
    TRIANGLE_PATTERN: 15,
    DOG_PATTERN: -25,
    FORK_POTENTIAL: 30,
    OPPOSITION: 15,
    KEY_SQUARE: 20,
    OPPONENT_MISTAKE: 30
};

// Directions for piece movement
export const DIRECTIONS = {
    WHITE_MOVES: [
        { dy: -1, dx: -1 }, { dy: -1, dx: 1 }  // Up-left, Up-right
    ],
    BLACK_MOVES: [
        { dy: 1, dx: -1 }, { dy: 1, dx: 1 }   // Down-left, Down-right
    ],
    KING_MOVES: [
        { dy: -1, dx: -1 }, { dy: -1, dx: 1 }, // Up-left, Up-right
        { dy: 1, dx: -1 }, { dy: 1, dx: 1 }    // Down-left, Down-right
    ]
};

// FIXED: Helper function for horizontally flipped board
// On a flipped board, dark squares are where (row + col) % 2 === 0
export function isDarkSquare(row, col) {
    return (row + col) % 2 === 0;  // Changed from === 1 to === 0 for flipped board
}

// Square Numbering for Notation (1-50) - Corrected for horizontally flipped board
export const SQUARE_NUMBERS = (function() {
    const numbers = new Array(BOARD_SIZE * BOARD_SIZE).fill(0);
    let count = 1;
    
    // For a horizontally flipped board, we number from right to left
    // This maintains the standard draughts numbering system but adapted for the flip
    for (let row = 0; row < BOARD_SIZE; row++) {
        // Number from right to left for all rows
        for (let col = BOARD_SIZE - 1; col >= 0; col--) {
            if (isDarkSquare(row, col)) {
                numbers[row * BOARD_SIZE + col] = count++;
            }
        }
    }
    return numbers;
})();

// Enhanced AI Parameters for Better Performance
export const AI_PARAMS = {
    MAX_DEPTH: {
        1: 2,
        2: 4,
        3: 8,
        4: 10,
        5: 14,
        6: 16
    },
    
    QUIESCENCE_DEPTH: { 
        1: 2, 
        2: 3, 
        3: 4, 
        4: 5, 
        5: 6, 
        6: 8
    },
    
    ITERATIVE_DEEPENING: {
        TIME_ALLOCATION: {
            1: 500,
            2: 1500,
            3: 3000,
            4: 6000,
            5: 12000,
            6: 20000
        },
        
        COMPLEX_POSITION_MULTIPLIER: { 
            1: 1.0,
            2: 1.1, 
            3: 1.2, 
            4: 1.3, 
            5: 1.5,
            6: 1.8
        },
        
        ASPIRATION_WINDOW: {
            INITIAL_DELTA: 50,
            MAX_RESEARCHES: 2,
            GROWTH_FACTOR: 2
        }
    },
    
    OPENING_BOOK: {
        RANDOMIZATION: { 
            1: 0.9,
            2: 0.7, 
            3: 0.5, 
            4: 0.3, 
            5: 0.1,
            6: 0.0
        },
        MAX_BOOK_DEPTH: 20
    },
    
    CACHE: {
        MAX_SIZE: 1000000,
        
        RETENTION_TIME: { 
            1: 5000, 
            2: 10000, 
            3: 30000,
            4: 60000, 
            5: 120000, 
            6: 300000
        },
        
        ENTRY_TYPES: {
            EXACT: 0,
            LOWER_BOUND: 1,
            UPPER_BOUND: 2
        },
        
        REPLACEMENT_STRATEGY: {
            DEPTH_PREFERRED: true,
            AGE_FACTOR: 0.9
        }
    },
    
    SEARCH_ENHANCEMENTS: {
        NULL_MOVE: {
            ENABLED: true,
            REDUCTION: 3,
            MIN_DEPTH: 3
        },
        
        LMR: {
            ENABLED: true,
            MIN_DEPTH: 3,
            MIN_MOVES: 3,
            REDUCTION: 1
        },
        
        FUTILITY: {
            ENABLED: true,
            MARGIN: 200,
            MAX_DEPTH: 3
        },
        
        DELTA_PRUNING: {
            ENABLED: true,
            MARGIN: 500
        }
    },
    
    MOVE_ORDERING: {
        HASH_MOVE_BONUS: 10000,
        CAPTURE_BONUS: 1000,
        MVV_LVA_FACTOR: 10,
        PROMOTION_BONUS: 900,
        KILLER_BONUS: 800,
        HISTORY_MAX: 500,
        CENTER_BONUS: 2,
        ADVANCE_BONUS: 5,
        THREAT_BONUS: 200
    },
    
    EVALUATION: {
        LAZY_MARGIN: 300,
        PATTERN_CACHE_SIZE: 10000,
        ENDGAME_THRESHOLD: 12,
        MATERIAL_FACTOR: 0.8
    }
};