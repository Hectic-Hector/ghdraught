/**
 * AI Parameters Module - Configuration for the Grandmaster AI
 * Contains all tunable parameters for search, evaluation, and behavior
 * @module ai.params
 */

export const AI_PARAMS = {
    // Maximum search depth by difficulty level
    MAX_DEPTH: {
        1: 4,   // Beginner
        2: 6,   // Easy
        3: 8,   // Intermediate
        4: 10,  // Advanced
        5: 12,  // Expert
        6: 14   // Grandmaster
    },
    
    // Quiescence search depth by level
    QUIESCENCE_DEPTH: {
        1: 2,
        2: 3,
        3: 4,
        4: 5,
        5: 6,
        6: 8
    },
    
    // Iterative deepening parameters
    ITERATIVE_DEEPENING: {
        // Base time allocation in milliseconds
        TIME_ALLOCATION: {
            1: 500,    // Beginner - 0.5 seconds
            2: 1000,   // Easy - 1 second
            3: 2000,   // Intermediate - 2 seconds
            4: 4000,   // Advanced - 4 seconds
            5: 8000,   // Expert - 8 seconds
            6: 15000   // Grandmaster - 15 seconds
        },
        
        // Multiplier for complex positions
        COMPLEX_POSITION_MULTIPLIER: {
            1: 1.0,
            2: 1.1,
            3: 1.2,
            4: 1.3,
            5: 1.5,
            6: 1.8
        },
        
        // Aspiration window settings
        ASPIRATION_WINDOW: {
            INITIAL_DELTA: 50,      // Initial window size
            MAX_RESEARCHES: 2,      // Maximum re-searches
            GROWTH_FACTOR: 2        // Window growth factor
        }
    },
    
    // Transposition table cache settings
    CACHE: {
        MAX_SIZE: 2000000,          // Maximum entries
        CLEANUP_THRESHOLD: 0.9,     // Cleanup when 90% full
        CLEANUP_PERCENTAGE: 0.3,    // Remove 30% on cleanup
        
        // Entry types for bounds
        ENTRY_TYPES: {
            EXACT: 0,
            LOWER_BOUND: 1,
            UPPER_BOUND: 2
        },
        
        // Replacement strategy
        REPLACEMENT_STRATEGY: {
            DEPTH_PREFERRED: true,   // Prefer deeper entries
            AGE_FACTOR: 0.9         // Age influence factor
        }
    },
    
    // Search enhancement parameters
    SEARCH_ENHANCEMENTS: {
        // Null move pruning
        NULL_MOVE: {
            ENABLED: true,
            MIN_DEPTH: 3,           // Minimum depth to apply
            REDUCTION: {
                NORMAL: 2,          // Normal reduction
                DEEP: 3             // Reduction at deeper depths
            }
        },
        
        // Late move reductions
        LMR: {
            ENABLED: true,
            MIN_DEPTH: 3,           // Minimum depth
            MIN_MOVES: 3,           // After this many moves
            REDUCTION: {
                NORMAL: 1,          // Normal reduction
                LATE: 2             // Very late moves
            }
        },
        
        // Futility pruning
        FUTILITY: {
            ENABLED: true,
            MARGIN: 200,            // Material margin
            MAX_DEPTH: 3            // Maximum depth to apply
        },
        
        // Delta pruning in quiescence
        DELTA_PRUNING: {
            ENABLED: true,
            MARGIN: 500             // Maximum material deficit
        }
    },
    
    // Move ordering parameters
    MOVE_ORDERING: {
        HASH_MOVE_BONUS: 10000,     // Transposition table move
        CAPTURE_BONUS: 1000,        // Base capture bonus
        MVV_LVA_FACTOR: 10,         // Most valuable victim factor
        PROMOTION_BONUS: 900,       // Promotion move bonus
        KILLER_BONUS: {
            FIRST: 900,             // First killer move
            SECOND: 800             // Second killer move
        },
        HISTORY_MAX: 400,           // Maximum history score
        TACTICAL_THREAT_BONUS: 50,  // Creating threats
        CENTER_CONTROL_BONUS: 5,    // Moving to center
        ADVANCEMENT_BONUS: 10       // Advancing pieces
    },
    
    // Evaluation parameters
    EVALUATION: {
        LAZY_MARGIN: 300,           // Lazy evaluation threshold
        PIECE_VALUES: {
            MAN: 100,               // Regular piece value
            KING: 450               // King value
        },
        
        // Phase-dependent weights
        PHASE_WEIGHTS: {
            OPENING: {
                MATERIAL: 1.0,
                MOBILITY: 2.0,
                POSITION: 1.5,
                SAFETY: 0.8
            },
            MIDDLEGAME: {
                MATERIAL: 1.0,
                MOBILITY: 1.5,
                POSITION: 1.2,
                SAFETY: 1.0
            },
            ENDGAME: {
                MATERIAL: 1.0,
                MOBILITY: 0.8,
                POSITION: 0.8,
                SAFETY: 0.6
            }
        },
        
        // Bonus/penalty values
        BONUSES: {
            TEMPO: 10,              // Side to move bonus
            TRAPPED_PIECE: -50,     // Trapped piece penalty
            PROTECTED_PIECE: 10,    // Protected piece bonus
            HANGING_PIECE: -30,     // Hanging piece penalty
            FORK_THREAT: 40,        // Fork bonus
            PIN_THREAT: 50,         // Pin bonus
            PROMOTION_DISTANCE: 20, // Per square closer
            BACK_RANK_CONTROL: 20,  // Controlling opponent's back rank
            MOBILITY_RESTRICTED: 30 // Restricting opponent mobility
        }
    },
    
    // Opening book parameters
    OPENING_BOOK: {
        ENABLED: true,
        MAX_DEPTH: 20,              // Maximum moves from book
        RANDOMIZATION: {            // Variation by level
            1: 0.9,                 // High randomization
            2: 0.7,
            3: 0.5,
            4: 0.3,
            5: 0.1,
            6: 0.0                  // Always play best
        }
    },
    
    // Time management
    TIME_MANAGEMENT: {
        PANIC_THRESHOLD: 0.1,       // 10% time left
        CRITICAL_THRESHOLD: 0.2,    // 20% time left
        MOVE_OVERHEAD: 50,          // Milliseconds overhead
        ENDGAME_EXTENSION: 1.5,     // Time multiplier in endgame
        TACTICAL_EXTENSION: 2.0     // Time multiplier for tactics
    },
    
    // Personality settings for ruthless play
    PERSONALITY: {
        AGGRESSION: {
            1: 0.5,                 // Passive
            2: 0.7,
            3: 0.9,
            4: 1.1,
            5: 1.3,
            6: 1.5                  // Very aggressive
        },
        COMPLEXITY_BIAS: {          // Prefer complex positions when winning
            1: 0.0,
            2: 0.0,
            3: 0.1,
            4: 0.2,
            5: 0.3,
            6: 0.5                  // Maximum complexity
        },
        SACRIFICE_WILLINGNESS: {    // Material sacrifice tendency
            1: 0.0,
            2: 0.1,
            3: 0.2,
            4: 0.3,
            5: 0.4,
            6: 0.5                  // Will sacrifice for attack
        }
    },
    
    // Debug and logging
    DEBUG: {
        LOG_SEARCH: false,          // Log search progress
        LOG_EVALUATION: false,      // Log evaluation details
        LOG_CACHE_STATS: true,      // Log cache performance
        LOG_TIME_MANAGEMENT: true,  // Log time usage
        NODE_COUNT_INTERVAL: 2048   // How often to check time
    }
};