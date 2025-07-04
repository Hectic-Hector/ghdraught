/**
 * Transposition Table Module - Advanced position caching for search optimization
 * @module ai.tt
 */

import { BOARD_SIZE, isDarkSquare } from '../constants.js';
import { AI_PARAMS } from './ai.params.js';

/**
 * Creates a high-performance transposition table
 * @param {number} maxSize - Maximum number of entries
 * @returns {Object} Transposition table interface
 */
export function createTranspositionTable(maxSize = 2000000) {
    const table = new Map();
    let accessCount = 0;
    let hits = 0;
    let stores = 0;
    
    /**
     * Generates a unique key for a position
     * Uses only dark squares for efficiency
     */
    function generateKey(position) {
        let key = '';
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (isDarkSquare(r, c)) {
                    key += position.pieces[r][c];
                }
            }
        }
        return key + position.currentPlayer;
    }
    
    /**
     * Stores an entry in the table
     * @param {string} key - Position key
     * @param {number} depth - Search depth
     * @param {number} value - Position value
     * @param {number} type - Entry type (EXACT, LOWER_BOUND, UPPER_BOUND)
     * @param {Object} bestMove - Best move found
     */
    function store(key, depth, value, type, bestMove) {
        // Check if we need to clean up
        if (table.size >= maxSize) {
            cleanup();
        }
        
        const existingEntry = table.get(key);
        
        // Replace if new entry is deeper or same depth with better bounds
        if (!existingEntry || 
            existingEntry.depth < depth ||
            (existingEntry.depth === depth && type === AI_PARAMS.CACHE.ENTRY_TYPES.EXACT)) {
            
            table.set(key, {
                depth,
                value,
                type,
                bestMove,
                accessTime: accessCount++,
                age: 0
            });
            stores++;
        }
    }
    
    /**
     * Looks up a position in the table
     * @param {string} key - Position key
     * @param {number} depth - Minimum required depth
     * @param {number} alpha - Alpha bound
     * @param {number} beta - Beta bound
     * @returns {Object|null} Entry if found and valid, null otherwise
     */
    function lookup(key, depth, alpha, beta) {
        const entry = table.get(key);
        if (!entry || entry.depth < depth) return null;
        
        // Update access time and hit counter
        entry.accessTime = accessCount++;
        entry.age = 0;
        hits++;
        
        // Check if entry provides useful bound
        if (entry.type === AI_PARAMS.CACHE.ENTRY_TYPES.EXACT) {
            return entry;
        } else if (entry.type === AI_PARAMS.CACHE.ENTRY_TYPES.LOWER_BOUND && entry.value >= beta) {
            return entry;
        } else if (entry.type === AI_PARAMS.CACHE.ENTRY_TYPES.UPPER_BOUND && entry.value <= alpha) {
            return entry;
        }
        
        // Entry exists but doesn't provide cutoff - still return for move ordering
        return { ...entry, useful: false };
    }
    
    /**
     * Cleans up old entries using a two-tier strategy
     * Removes least recently used entries and old entries
     */
    function cleanup() {
        const entries = Array.from(table.entries());
        
        // Age all entries
        entries.forEach(([key, entry]) => {
            entry.age++;
        });
        
        // Sort by combined score (prefer recent, deep entries)
        entries.sort((a, b) => {
            const scoreA = a[1].accessTime / 1000 + a[1].depth * 10 - a[1].age * 5;
            const scoreB = b[1].accessTime / 1000 + b[1].depth * 10 - b[1].age * 5;
            return scoreA - scoreB;
        });
        
        // Remove bottom 30%
        const toDelete = Math.floor(entries.length * 0.3);
        for (let i = 0; i < toDelete; i++) {
            table.delete(entries[i][0]);
        }
    }
    
    /**
     * Clears the entire table
     */
    function clear() {
        table.clear();
        accessCount = 0;
        hits = 0;
        stores = 0;
    }
    
    /**
     * Gets statistics about the table
     */
    function getStats() {
        const hitRate = stores > 0 ? (hits / (hits + stores) * 100).toFixed(1) : 0;
        return {
            size: table.size,
            capacity: maxSize,
            hits,
            stores,
            hitRate: `${hitRate}%`,
            fillRate: `${(table.size / maxSize * 100).toFixed(1)}%`
        };
    }
    
    /**
     * Prefetches positions that might be searched soon
     * Useful for pondering during opponent's turn
     */
    function prefetch(position, depth) {
        const key = generateKey(position);
        if (!table.has(key)) {
            // Store a shallow entry to reserve space
            store(key, 0, 0, AI_PARAMS.CACHE.ENTRY_TYPES.EXACT, null);
        }
    }
    
    /**
     * Ages all entries - call periodically to identify stale entries
     */
    function ageEntries() {
        for (const entry of table.values()) {
            entry.age++;
        }
    }
    
    /**
     * Gets the best move from a cached position if available
     */
    function getBestMove(position) {
        const key = generateKey(position);
        const entry = table.get(key);
        return entry?.bestMove || null;
    }
    
    /**
     * Checks if a position is in the table
     */
    function has(position) {
        const key = generateKey(position);
        return table.has(key);
    }
    
    return {
        generateKey,
        store,
        lookup,
        cleanup,
        clear,
        getStats,
        prefetch,
        ageEntries,
        getBestMove,
        has,
        get size() { return table.size; }
    };
}

/**
 * Creates a smaller evaluation cache for position evaluations
 * Separate from main TT to avoid pollution
 */
export function createEvaluationCache(maxSize = 100000) {
    const cache = new Map();
    
    function store(key, value) {
        if (cache.size >= maxSize) {
            // Simple FIFO cleanup for eval cache
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
        }
        cache.set(key, value);
    }
    
    function lookup(key) {
        return cache.get(key);
    }
    
    function clear() {
        cache.clear();
    }
    
    return { store, lookup, clear, get size() { return cache.size; } };
}