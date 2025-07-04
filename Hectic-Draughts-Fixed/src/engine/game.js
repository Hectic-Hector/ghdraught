/**
 * International Draughts Game Logic - ENHANCED VERSION
 * - Performance optimizations for faster move generation
 * - Better draw detection (50-move rule, blocked positions)
 * - Enhanced move history with more metadata
 * - Position analysis helpers
 * - Improved game state tracking
 * @author codewithheck
 * Enhanced for better gameplay
 */

import {
    BOARD_SIZE, PIECE, PLAYER, GAME_STATE, SQUARE_NUMBERS,
    GAME_MODE, DIRECTIONS, isDarkSquare
} from './constants.js';
import { generateFEN, parseFEN } from '../utils/fen-parser.js';

export class Game {
    constructor() { 
        this.reset(); 
    }
    
    reset() {
        this.pieces = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(PIECE.NONE));
        this.currentPlayer = PLAYER.WHITE;
        this.gameState = GAME_STATE.ONGOING;
        this.moveHistory = [];
        this.capturedPieces = { [PLAYER.WHITE]: [], [PLAYER.BLACK]: [] };
        this.gameMode = GAME_MODE.NORMAL;
        
        // Enhanced game tracking
        this.movesSinceCapture = 0;  // For 50-move rule
        this.positionHistory = new Map();  // For threefold repetition
        this.statistics = {
            totalMoves: 0,
            captures: { [PLAYER.WHITE]: 0, [PLAYER.BLACK]: 0 },
            promotions: { [PLAYER.WHITE]: 0, [PLAYER.BLACK]: 0 },
            gameStartTime: Date.now(),
            thinkingTime: { [PLAYER.WHITE]: 0, [PLAYER.BLACK]: 0 }
        };
        
        // Game options
        this.maxCaptureRule = false;  // Default to optional maximum capture
        
        // Performance optimization: cache legal moves
        this.legalMovesCache = null;
        this.cacheValid = false;
        
        this.setupInitialPosition();
    }
    
    setupInitialPosition() {
        // Clear the board
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                this.pieces[r][c] = PIECE.NONE;
            }
        }
        
        // Place black pieces
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (isDarkSquare(r, c)) {
                    this.pieces[r][c] = PIECE.BLACK;
                }
            }
        }
        
        // Place white pieces
        for (let r = 6; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (isDarkSquare(r, c)) {
                    this.pieces[r][c] = PIECE.WHITE;
                }
            }
        }
        
        // Record initial position
        this.recordPosition();
    }
    
    getPiece(row, col) { 
        if (this.isValidPosition(row, col)) return this.pieces[row][col]; 
        return PIECE.NONE; 
    }
    
    setPiece(row, col, piece) { 
        if (this.isValidPosition(row, col)) {
            this.pieces[row][col] = piece;
            this.invalidateCache();
        }
    }
    
    makeMove(move, thinkingTime = 0) {
        if (!this.isValidMove(move)) return false;
        
        const startTime = Date.now();
        const piece = this.getPiece(move.from.row, move.from.col);
        const isCapture = move.captures && move.captures.length > 0;
        const capturedPieces = [];
        
        // Record captured pieces for undo
        if (isCapture) {
            move.captures.forEach(cap => {
                capturedPieces.push({
                    row: cap.row,
                    col: cap.col,
                    piece: this.getPiece(cap.row, cap.col)
                });
            });
        }
        
        // Create comprehensive move record
        const moveRecord = {
            from: { ...move.from },
            to: { ...move.to },
            piece,
            captures: move.captures ? [...move.captures] : [],
            capturedPieces,
            notation: this.getMoveNotation(move),
            timestamp: Date.now(),
            moveNumber: this.moveHistory.length + 1,
            player: this.currentPlayer,
            thinkingTime: thinkingTime || (Date.now() - startTime),
            wasPromotion: false,
            previousFEN: this.getFEN()
        };
        
        // Execute the move
        this.setPiece(move.from.row, move.from.col, PIECE.NONE);
        this.setPiece(move.to.row, move.to.col, piece);
        
        // Remove captured pieces
        if (isCapture) {
            move.captures.forEach(cap => {
                this.setPiece(cap.row, cap.col, PIECE.NONE);
                this.capturedPieces[this.currentPlayer].push(this.getPiece(cap.row, cap.col));
            });
            this.statistics.captures[this.currentPlayer] += move.captures.length;
            this.movesSinceCapture = 0;
        } else {
            this.movesSinceCapture++;
        }
        
        // Handle promotion
        if (this.shouldPromote(piece, move.to.row) && !this.canContinueCapturing(move.to.row, move.to.col)) {
            const newKing = piece === PIECE.WHITE ? PIECE.WHITE_KING : PIECE.BLACK_KING;
            this.setPiece(move.to.row, move.to.col, newKing);
            moveRecord.wasPromotion = true;
            this.statistics.promotions[this.currentPlayer]++;
        }
        
        // Update game state
        if (this.gameMode === GAME_MODE.NORMAL) {
            this.currentPlayer = this.currentPlayer === PLAYER.WHITE ? PLAYER.BLACK : PLAYER.WHITE;
        }
        
        // Record final position
        moveRecord.fen = this.getFEN();
        this.moveHistory.push(moveRecord);
        this.statistics.totalMoves++;
        this.statistics.thinkingTime[moveRecord.player] += moveRecord.thinkingTime;
        
        // Update position history for repetition detection
        this.recordPosition();
        
        // Check game state
        this.updateGameState();
        
        this.invalidateCache();
        return true;
    }
    
    undoMove() {
        if (this.moveHistory.length === 0) return false;
        
        const lastMove = this.moveHistory.pop();
        
        // Restore previous position
        if (lastMove.previousFEN) {
            this.loadFEN(lastMove.previousFEN);
        }
        
        // Update statistics
        this.statistics.totalMoves--;
        this.statistics.thinkingTime[lastMove.player] -= lastMove.thinkingTime;
        
        if (lastMove.captures.length > 0) {
            this.statistics.captures[lastMove.player] -= lastMove.captures.length;
        }
        
        if (lastMove.wasPromotion) {
            this.statistics.promotions[lastMove.player]--;
        }
        
        this.invalidateCache();
        return true;
    }
    
    isValidMove(move) { 
        const legalMoves = this.getLegalMoves();
        return legalMoves.some(m => 
            m.from.row === move.from.row && 
            m.from.col === move.from.col && 
            m.to.row === move.to.row && 
            m.to.col === move.to.col
        );
    }
    
    getLegalMoves() {
        // Use cache if valid
        if (this.cacheValid && this.legalMovesCache) {
            return this.legalMovesCache;
        }
        
        const captures = this.getAvailableCaptures();
        if (captures.length > 0) {
            this.legalMovesCache = captures;
            this.cacheValid = true;
            return captures;
        }
        
        const normalMoves = this.getNormalMoves();
        this.legalMovesCache = normalMoves;
        this.cacheValid = true;
        return normalMoves;
    }
    
    invalidateCache() {
        this.cacheValid = false;
        this.legalMovesCache = null;
    }

    getAvailableCaptures() {
        let allCaptures = [];
        
        // Optimize by checking pieces of current player only
        const playerPieces = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (this.isPieceOfCurrentPlayer(this.pieces[r][c])) {
                    playerPieces.push({ row: r, col: c });
                }
            }
        }
        
        // Find captures for each piece
        for (const pos of playerPieces) {
            this.findCaptureSequences(allCaptures, this.pieces, pos, [], []);
        }
        
        // Apply maximum capture rule only if enabled
        if (allCaptures.length > 0 && this.maxCaptureRule) {
            const maxCaptures = Math.max(...allCaptures.map(move => move.captures.length));
            return allCaptures.filter(move => move.captures.length === maxCaptures);
        }
        
        // If max capture rule is off, return all possible captures
        return allCaptures;
    }

    findCaptureSequences(sequences, pieces, currentPos, path, capturedSoFar) {
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
                
                while (this.isValidPosition(checkRow, checkCol)) {
                    const checkPiece = pieces[checkRow][checkCol];
                    
                    if (checkPiece !== PIECE.NONE) {
                        if (this.isOpponentPiece(checkPiece)) {
                            enemyPos = { row: checkRow, col: checkCol };
                            break;
                        } else {
                            break;
                        }
                    }
                    
                    checkRow += dir.dy;
                    checkCol += dir.dx;
                }
                
                if (enemyPos && !capturedSoFar.some(p => p.row === enemyPos.row && p.col === enemyPos.col)) {
                    let landRow = enemyPos.row + dir.dy;
                    let landCol = enemyPos.col + dir.dx;
                    
                    while (this.isValidPosition(landRow, landCol) && pieces[landRow][landCol] === PIECE.NONE) {
                        foundJump = true;
                        
                        const newPieces = pieces.map(row => [...row]);
                        newPieces[currentPos.row][currentPos.col] = PIECE.NONE;
                        newPieces[enemyPos.row][enemyPos.col] = PIECE.NONE;
                        newPieces[landRow][landCol] = piece;
                        
                        this.findCaptureSequences(sequences, newPieces, 
                            { row: landRow, col: landCol }, 
                            [...path, currentPos], 
                            [...capturedSoFar, enemyPos]);
                        
                        landRow += dir.dy;
                        landCol += dir.dx;
                    }
                }
            } else {
                // Regular piece captures
                const jumpOverPos = { row: currentPos.row + dir.dy, col: currentPos.col + dir.dx };
                const landPos = { row: currentPos.row + 2 * dir.dy, col: currentPos.col + 2 * dir.dx };

                if (this.isValidPosition(landPos.row, landPos.col) && 
                    pieces[landPos.row][landPos.col] === PIECE.NONE && 
                    this.isOpponentPiece(pieces[jumpOverPos.row][jumpOverPos.col])) {
                    
                    const alreadyCaptured = capturedSoFar.some(p => 
                        p.row === jumpOverPos.row && p.col === jumpOverPos.col);
                    
                    if (!alreadyCaptured) {
                        foundJump = true;
                        const newPieces = pieces.map(row => [...row]);
                        newPieces[currentPos.row][currentPos.col] = PIECE.NONE;
                        newPieces[jumpOverPos.row][jumpOverPos.col] = PIECE.NONE;
                        newPieces[landPos.row][landPos.col] = piece;

                        this.findCaptureSequences(sequences, newPieces, landPos, 
                            [...path, currentPos], [...capturedSoFar, jumpOverPos]);
                    }
                }
            }
        }

        if (!foundJump && capturedSoFar.length > 0) {
            sequences.push({ 
                from: path[0] || currentPos, 
                to: currentPos, 
                captures: capturedSoFar 
            });
        }
    }
    
    canContinueCapturing(r, c) { 
        const tempPosition = {
            pieces: this.pieces,
            currentPlayer: this.currentPlayer
        };
        
        const captures = [];
        this.findCaptureSequences(captures, tempPosition.pieces, {row: r, col: c}, [], []);
        
        return captures.length > 0;
    }
    
    getNormalMoves() { 
        const moves = [];
        
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (this.isPieceOfCurrentPlayer(this.getPiece(r, c))) {
                    this.findNormalMoves(moves, r, c);
                }
            }
        }
        
        return moves;
    }
    
    findNormalMoves(moves, r, c) { 
        const p = this.getPiece(r, c); 
        const isKing = p === PIECE.WHITE_KING || p === PIECE.BLACK_KING;
        
        if (isKing) {
            // Flying king movement
            const dirs = DIRECTIONS.KING_MOVES;
            
            for (const d of dirs) { 
                let nr = r + d.dy, nc = c + d.dx; 
                
                while (this.isValidPosition(nr, nc) && this.getPiece(nr, nc) === PIECE.NONE && isDarkSquare(nr, nc)) {
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
            const dirs = this.currentPlayer === PLAYER.WHITE ? DIRECTIONS.WHITE_MOVES : DIRECTIONS.BLACK_MOVES;
            
            for (const d of dirs) { 
                const nr = r + d.dy, nc = c + d.dx; 
                if (this.isValidPosition(nr, nc) && this.getPiece(nr, nc) === PIECE.NONE && isDarkSquare(nr, nc)) {
                    moves.push({ 
                        from: { row: r, col: c }, 
                        to: { row: nr, col: nc }, 
                        captures: [] 
                    });
                }
            }
        }
    }
    
    updateGameState() { 
        if (this.gameMode === GAME_MODE.EDIT) return;
        
        // Check for no legal moves (loss)
        if (this.getLegalMoves().length === 0) { 
            this.gameState = this.currentPlayer === PLAYER.WHITE ? GAME_STATE.BLACK_WIN : GAME_STATE.WHITE_WIN;
            return;
        }
        
        // Check various draw conditions
        if (this.isDrawByRepetition() || 
            this.isDrawByMaterial() || 
            this.isDrawBy50MoveRule() ||
            this.isDrawByBlockade()) {
            this.gameState = GAME_STATE.DRAW;
            return;
        }
        
        this.gameState = GAME_STATE.ONGOING;
    }
    
    recordPosition() {
        const fen = this.getFEN();
        const count = this.positionHistory.get(fen) || 0;
        this.positionHistory.set(fen, count + 1);
    }
    
    isDrawByRepetition() { 
        // Check if current position has occurred 3 times
        const currentFEN = this.getFEN();
        return (this.positionHistory.get(currentFEN) || 0) >= 3;
    }
    
    isDrawBy50MoveRule() {
        // In draughts, it's typically 50 moves without capture or promotion
        return this.movesSinceCapture >= 50;
    }
    
    isDrawByBlockade() {
        // Check if all pieces are blocked (rare but possible)
        const moves = this.getLegalMoves();
        if (moves.length > 0) return false;
        
        // Switch to opponent and check their moves
        this.currentPlayer = this.currentPlayer === PLAYER.WHITE ? PLAYER.BLACK : PLAYER.WHITE;
        this.invalidateCache();
        const opponentMoves = this.getLegalMoves();
        this.currentPlayer = this.currentPlayer === PLAYER.WHITE ? PLAYER.BLACK : PLAYER.WHITE;
        this.invalidateCache();
        
        return opponentMoves.length === 0;
    }
    
    isDrawByMaterial() { 
        let wk = 0, bk = 0, wp = 0, bp = 0;
        
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const p = this.getPiece(r, c);
                if (p === PIECE.WHITE_KING) wk++;
                else if (p === PIECE.BLACK_KING) bk++;
                else if (p === PIECE.WHITE) wp++;
                else if (p === PIECE.BLACK) bp++;
            }
        }
        
        // No regular pieces left
        if (wp === 0 && bp === 0) {
            // Various king endgames that are draws
            if ((wk === 1 && bk === 1) || 
                (wk === 2 && bk === 1) || 
                (wk === 1 && bk === 2) ||
                (wk === 2 && bk === 2)) {
                return true;
            }
        }
        
        return false;
    }
    
    // Position analysis helpers
    getMaterialBalance() {
        let whiteValue = 0, blackValue = 0;
        
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const piece = this.getPiece(r, c);
                switch (piece) {
                    case PIECE.WHITE: whiteValue += 100; break;
                    case PIECE.WHITE_KING: whiteValue += 350; break;
                    case PIECE.BLACK: blackValue += 100; break;
                    case PIECE.BLACK_KING: blackValue += 350; break;
                }
            }
        }
        
        return whiteValue - blackValue;
    }
    
    getPieceCount() {
        const count = {
            [PLAYER.WHITE]: { men: 0, kings: 0, total: 0 },
            [PLAYER.BLACK]: { men: 0, kings: 0, total: 0 }
        };
        
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const piece = this.getPiece(r, c);
                switch (piece) {
                    case PIECE.WHITE:
                        count[PLAYER.WHITE].men++;
                        count[PLAYER.WHITE].total++;
                        break;
                    case PIECE.WHITE_KING:
                        count[PLAYER.WHITE].kings++;
                        count[PLAYER.WHITE].total++;
                        break;
                    case PIECE.BLACK:
                        count[PLAYER.BLACK].men++;
                        count[PLAYER.BLACK].total++;
                        break;
                    case PIECE.BLACK_KING:
                        count[PLAYER.BLACK].kings++;
                        count[PLAYER.BLACK].total++;
                        break;
                }
            }
        }
        
        return count;
    }
    
    getGamePhase() {
        const totalPieces = this.getPieceCount()[PLAYER.WHITE].total + 
                           this.getPieceCount()[PLAYER.BLACK].total;
        
        if (totalPieces > 16) return 'opening';
        if (totalPieces > 10) return 'middlegame';
        return 'endgame';
    }
    
    getGameStatistics() {
        const duration = Date.now() - this.statistics.gameStartTime;
        const pieceCount = this.getPieceCount();
        
        return {
            ...this.statistics,
            duration,
            currentPosition: {
                material: this.getMaterialBalance(),
                pieces: pieceCount,
                phase: this.getGamePhase(),
                movesSinceCapture: this.movesSinceCapture
            },
            averageThinkingTime: {
                [PLAYER.WHITE]: this.statistics.totalMoves > 0 ? 
                    this.statistics.thinkingTime[PLAYER.WHITE] / Math.ceil(this.statistics.totalMoves / 2) : 0,
                [PLAYER.BLACK]: this.statistics.totalMoves > 0 ? 
                    this.statistics.thinkingTime[PLAYER.BLACK] / Math.floor(this.statistics.totalMoves / 2) : 0
            }
        };
    }
    
    getFEN() { 
        return generateFEN({ pieces: this.pieces, currentPlayer: this.currentPlayer }); 
    }
    
    loadFEN(fen) { 
        try { 
            const pos = parseFEN(fen);
            this.pieces = pos.pieces;
            this.currentPlayer = pos.currentPlayer;
            this.moveHistory = [];
            this.capturedPieces = { [PLAYER.WHITE]: [], [PLAYER.BLACK]: [] };
            this.positionHistory.clear();
            this.movesSinceCapture = 0;
            this.statistics = {
                totalMoves: 0,
                captures: { [PLAYER.WHITE]: 0, [PLAYER.BLACK]: 0 },
                promotions: { [PLAYER.WHITE]: 0, [PLAYER.BLACK]: 0 },
                gameStartTime: Date.now(),
                thinkingTime: { [PLAYER.WHITE]: 0, [PLAYER.BLACK]: 0 }
            };
            this.invalidateCache();
            this.recordPosition();
            this.updateGameState();
            return true;
        } catch (e) { 
            console.error('FEN Error:', e.message);
            return false;
        }
    }
    
    isValidPosition(r, c) { 
        return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE; 
    }
    
    isPieceOfCurrentPlayer(p) { 
        return this.currentPlayer === PLAYER.WHITE ? 
            (p === PIECE.WHITE || p === PIECE.WHITE_KING) : 
            (p === PIECE.BLACK || p === PIECE.BLACK_KING); 
    }
    
    isOpponentPiece(p) { 
        return this.currentPlayer === PLAYER.WHITE ? 
            (p === PIECE.BLACK || p === PIECE.BLACK_KING) : 
            (p === PIECE.WHITE || p === PIECE.WHITE_KING); 
    }
    
    getMoveNotation(move) { 
        if (!move || !move.from || !move.to) return '--';
        const from = SQUARE_NUMBERS[move.from.row * BOARD_SIZE + move.from.col];
        const to = SQUARE_NUMBERS[move.to.row * BOARD_SIZE + move.to.col];
        return (move.captures && move.captures.length > 0) ? 
            `${from}x${to}` : `${from}-${to}`;
    }
    
    shouldPromote(p, r) { 
        return (p === PIECE.WHITE && r === 0) || (p === PIECE.BLACK && r === BOARD_SIZE - 1); 
    }
    
    // New helper methods for game analysis
    isQuietPosition() {
        // Position is quiet if no captures are available
        const captures = this.getAvailableCaptures();
        return captures.length === 0;
    }
    
    getTension() {
        // Measure position tension by counting potential captures
        let tension = 0;
        
        // Check captures for both sides
        const currentCaptures = this.getAvailableCaptures();
        tension += currentCaptures.length * 2;
        
        // Switch sides and check opponent captures
        this.currentPlayer = this.currentPlayer === PLAYER.WHITE ? PLAYER.BLACK : PLAYER.WHITE;
        this.invalidateCache();
        const opponentCaptures = this.getAvailableCaptures();
        tension += opponentCaptures.length * 2;
        
        // Restore current player
        this.currentPlayer = this.currentPlayer === PLAYER.WHITE ? PLAYER.BLACK : PLAYER.WHITE;
        this.invalidateCache();
        
        return tension;
    }
    
    getLastMove() {
        return this.moveHistory.length > 0 ? 
            this.moveHistory[this.moveHistory.length - 1] : null;
    }
    
    getMovesSinceCapture() {
        return this.movesSinceCapture;
    }
    
    // Game options methods
    setMaxCaptureRule(enabled) {
        this.maxCaptureRule = enabled;
        this.invalidateCache(); // Invalidate cache as legal moves may change
    }
    
    getMaxCaptureRule() {
        return this.maxCaptureRule;
    }
}