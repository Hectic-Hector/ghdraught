/**
 * AI Core Module - Main orchestrator for the Grandmaster AI
 * Combines all modules into a cohesive, ruthless draughts engine
 * @module ai.core
 */

import { AI_PARAMS } from './ai.params.js';
import { createTranspositionTable, createEvaluationCache } from './ai.tt.js';
import { getBestMove, negamax, quiescenceSearch } from './ai.search.js';
import { 
    evaluatePosition, 
    evaluateMaterial,
    evaluateMobilityDifferential,
    evaluateTacticalThreats,
    evaluateStrategicControl,
    getThreatHeatmap,
    getFormationScore,
    simulateOpponentPlan
} from './ai.evaluation.js';
import { 
    orderMoves, 
    orderMovesAtRoot, 
    updateKillerMoves, 
    updateHistory,
    quickEvaluateMove,
    getMoveKey,
    isSameMove,
    clearHistoryTable
} from './ai.move-ordering.js';
import { 
    isMoveReallySafe, 
    staticExchangeEvaluation, 
    isProtected,
    countDefenders,
    countAttackers,
    isSafeCapture,
    canSafelyAdvance,
    evaluatePieceVulnerability,
    findSafeSquares
} from './ai.safety.js';
import { 
    evaluateCaptureSequence, 
    countCaptureValue,
    canCapture,
    canThreaten,
    inCheck,
    givesCheck,
    findTacticalShots,
    findCombinations,
    evaluateBreakthroughPotential,
    detectPinsAndSkewers
} from './ai.tactics.js';
import { 
    makeMove, 
    generateMoves, 
    getAvailableCaptures,
    findCaptureSequences,
    addNormalMovesForPiece,
    getPieceCapturesFrom,
    shouldPromote,
    getMoveNotation,
    isValidSquare,
    isPieceOfCurrentPlayer,
    isOpponentPiece,
    isPlayerPiece,
    countTotalPieces,
    getPieceCounts,
    hasCaptures,
    getGamePhase
} from './ai.utils.js';

/**
 * GrandmasterAI - The main AI class that orchestrates all modules
 */
export class GrandmasterAI {
    constructor() {
        // Core components
        this.cache = createTranspositionTable();
        this.evalCache = new Map();  // Use a regular Map instead of createEvaluationCache
        this.heatmapCache = new Map();
        
        // Search state
        this.level = 3;
        this.nodeCount = 0;
        this.searchAborted = false;
        this.maxRecursionDepth = 60;
        this.positionHistory = [];
        
        // Move ordering tables
        this.killerMoves = Array(100).fill(null).map(() => [null, null]);
        this.historyTable = new Map();
        
        // Opening book (optional)
        this.openingBook = null;
        
        // Statistics
        this.statistics = {
            gamesPlayed: 0,
            totalNodes: 0,
            totalTime: 0,
            cacheHits: 0
        };
        
        // Set initial difficulty
        this.setDifficulty(this.level);
        
        postMessage({
            type: 'log',
            data: { message: 'GrandmasterAI initialized - Ready for ruthless play!' }
        });
    }
    
    /**
     * Sets the AI difficulty level
     * @param {number} level - Difficulty level (1-6)
     */
    setDifficulty(level) {
        this.level = Math.max(1, Math.min(6, level));
        this.cache.clear();
        this.evalCache.clear();
        this.heatmapCache.clear();
        this.quiescenceDepth = AI_PARAMS.QUIESCENCE_DEPTH[this.level] || 4;
        
        postMessage({
            type: 'log',
            data: { 
                message: `AI difficulty set to level ${this.level} (${this.getDifficultyName()})`,
                depth: AI_PARAMS.MAX_DEPTH[this.level],
                time: AI_PARAMS.ITERATIVE_DEEPENING.TIME_ALLOCATION[this.level]
            }
        });
    }
    
    /**
     * Gets human-readable difficulty name
     * @returns {string} Difficulty name
     */
    getDifficultyName() {
        const names = {
            1: 'Beginner',
            2: 'Easy',
            3: 'Intermediate',
            4: 'Advanced',
            5: 'Expert',
            6: 'Grandmaster'
        };
        return names[this.level] || 'Unknown';
    }
    
    /**
     * Main method to get the best move
     * @param {Object} position - Current position
     * @param {Array} moveHistoryNotations - Move history
     * @returns {Promise<Object>} Best move
     */
    async getMove(position, moveHistoryNotations) {
        const startTime = Date.now();
        
        postMessage({
            type: 'log',
            data: { message: `${this.getDifficultyName()} AI analyzing position...` }
        });
        
        // Reset search state
        this.nodeCount = 0;
        this.searchAborted = false;
        
        // Clean up caches periodically
        if (this.evalCache.size > 50000) {
            this.evalCache.clear();
            this.heatmapCache.clear();
        }
        
        if (this.historyTable.size > 100000) {
            clearHistoryTable(this.historyTable);
        }
        
        // Get the best move using search
        const bestMove = await getBestMove(this, position, moveHistoryNotations);
        
        // Update statistics
        const timeTaken = Date.now() - startTime;
        this.statistics.totalNodes += this.nodeCount;
        this.statistics.totalTime += timeTaken;
        
        // Log cache performance
        const cacheStats = this.cache.getStats();
        postMessage({
            type: 'log',
            data: { 
                message: `Cache performance: ${cacheStats.hitRate} hit rate, ${cacheStats.fillRate} full`
            }
        });
        
        return bestMove;
    }
    
    /**
     * Aborts the current search
     */
    abortSearch() {
        this.searchAborted = true;
        postMessage({
            type: 'log',
            data: { message: 'Search aborted by request' }
        });
    }
    
    /**
     * Sets the opening book
     * @param {Object} book - Opening book instance
     */
    setOpeningBook(book) {
        this.openingBook = book;
    }
    
    /**
     * Gets AI statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            avgNodesPerMove: this.statistics.gamesPlayed > 0 ? 
                Math.floor(this.statistics.totalNodes / this.statistics.gamesPlayed) : 0,
            avgTimePerMove: this.statistics.gamesPlayed > 0 ?
                Math.floor(this.statistics.totalTime / this.statistics.gamesPlayed) : 0,
            cacheStats: this.cache.getStats()
        };
    }
    
    /**
     * Resets AI state for a new game
     */
    resetForNewGame() {
        this.positionHistory = [];
        this.statistics.gamesPlayed++;
        
        // Clear killer moves for new game
        this.killerMoves = Array(100).fill(null).map(() => [null, null]);
        
        postMessage({
            type: 'log',
            data: { message: 'AI reset for new game' }
        });
    }
    
    // Bind all module functions to this instance
    
    // Search functions
    negamax = (position, depth, alpha, beta, startTime, timeLimit, recursionDepth, ply) => 
        negamax(this, position, depth, alpha, beta, startTime, timeLimit, recursionDepth, ply);
    
    quiescenceSearch = (position, alpha, beta, depth, startTime, timeLimit, recursionDepth) =>
        quiescenceSearch(this, position, alpha, beta, depth, startTime, timeLimit, recursionDepth);
    
    // Evaluation functions
    evaluatePosition = (position) => evaluatePosition(this, position);
    evaluateMaterial = evaluateMaterial;
    evaluateMobilityDifferential = (position) => evaluateMobilityDifferential(this, position);
    evaluateTacticalThreats = (position, pieces) => evaluateTacticalThreats(this, position, pieces);
    evaluateStrategicControl = evaluateStrategicControl;
    getThreatHeatmap = getThreatHeatmap;
    getFormationScore = getFormationScore;
    simulateOpponentPlan = simulateOpponentPlan;
    
    // Move ordering functions
    orderMoves = (moves, position, ply) => orderMoves(moves, position, ply, this);
    orderMovesAtRoot = (moves, position) => orderMovesAtRoot(moves, position, this);
    updateKillerMoves = (move, ply) => updateKillerMoves(move, ply, this.killerMoves);
    updateHistory = (move, depth) => updateHistory(move, depth, this.historyTable);
    quickEvaluateMove = (position, move) => quickEvaluateMove(position, move, this);
    getMoveKey = getMoveKey;
    isSameMove = isSameMove;
    
    // Safety functions
    isMoveReallySafe = (position, move) => isMoveReallySafe(this, position, move);
    staticExchangeEvaluation = (position, move) => staticExchangeEvaluation(this, position, move);
    isProtected = (position, row, col, player) => isProtected(this, position, row, col, player);
    countDefenders = (position, row, col, player) => countDefenders(this, position, row, col, player);
    countAttackers = (position, row, col, player) => countAttackers(this, position, row, col, player);
    isSafeCapture = (position, move) => isSafeCapture(this, position, move);
    canSafelyAdvance = (position, from, to) => canSafelyAdvance(this, position, from, to);
    evaluatePieceVulnerability = (position, row, col) => evaluatePieceVulnerability(this, position, row, col);
    findSafeSquares = (position, row, col) => findSafeSquares(this, position, row, col);
    
    // Tactics functions
    evaluateCaptureSequence = (position, move) => evaluateCaptureSequence(this, position, move);
    countCaptureValue = countCaptureValue;
    canCapture = (position) => canCapture(this, position);
    canThreaten = (position, move) => canThreaten(this, position, move);
    inCheck = (position) => inCheck(this, position);
    givesCheck = (position, move) => givesCheck(this, position, move);
    findTacticalShots = (position) => findTacticalShots(this, position);
    findCombinations = (position, depth) => findCombinations(this, position, depth);
    evaluateBreakthroughPotential = (position, piece) => evaluateBreakthroughPotential(this, position, piece);
    detectPinsAndSkewers = (position) => detectPinsAndSkewers(this, position);
    
    // Utility functions
    makeMove = makeMove;
    generateMoves = generateMoves;
    getAvailableCaptures = getAvailableCaptures;
    findCaptureSequences = findCaptureSequences;
    addNormalMovesForPiece = addNormalMovesForPiece;
    getPieceCapturesFrom = getPieceCapturesFrom;
    shouldPromote = shouldPromote;
    getMoveNotation = getMoveNotation;
    isValidSquare = isValidSquare;
    isPieceOfCurrentPlayer = isPieceOfCurrentPlayer;
    isOpponentPiece = isOpponentPiece;
    isPlayerPiece = isPlayerPiece;
    countTotalPieces = countTotalPieces;
    getPieceCounts = getPieceCounts;
    hasCaptures = hasCaptures;
    getGamePhase = getGamePhase;
}

// Worker message handler
const ai = new GrandmasterAI();

self.onmessage = async (event) => {
    const { type, requestId, data } = event.data;
    
    try {
        switch (type) {
            case 'initialize':
                postMessage({ 
                    type: 'initialized',
                    data: { 
                        version: '2.0',
                        features: ['ruthless', 'modular', 'grandmaster']
                    }
                });
                break;
                
            case 'setDifficulty':
                ai.setDifficulty(data.level);
                postMessage({
                    type: 'difficultySet',
                    requestId,
                    data: { level: ai.level, name: ai.getDifficultyName() }
                });
                break;
                
            case 'getMove':
                const move = await ai.getMove(data.position, data.moveHistoryNotations);
                postMessage({
                    type: 'moveResult',
                    requestId,
                    data: { move }
                });
                break;
                
            case 'abort':
                ai.abortSearch();
                break;
                
            case 'newGame':
                ai.resetForNewGame();
                break;
                
            case 'getStats':
                postMessage({
                    type: 'statistics',
                    requestId,
                    data: ai.getStatistics()
                });
                break;
                
            default:
                postMessage({
                    type: 'error',
                    requestId,
                    error: `Unknown message type: ${type}`
                });
        }
    } catch (error) {
        console.error('AI Error:', error);
        postMessage({
            type: 'moveResult',
            requestId,
            error: error.message
        });
    }
};