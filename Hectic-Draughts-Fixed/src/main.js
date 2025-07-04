import { Game } from './engine/game.js';
import { Board } from './view/board.js';
import { UI } from './view/ui.js';
import { AI } from './engine/aiController.js';  // Changed to use AIController
import { History } from './engine/history.js';
import { Notification } from './view/notification.js';
import { PLAYER, GAME_STATE, PIECE, GAME_MODE, BOARD_SIZE } from './engine/constants.js';

class GameController {
    constructor() {
        this.game = new Game();
        this.board = new Board();
        this.ui = new UI();
        this.ai = AI;  // Using the singleton instance
        this.history = new History(this.game);
        this.notification = new Notification();
        this.isPlayerVsAI = true;
        
        // Enhanced tracking
        this.moveStartTime = null;
        this.gameTimer = null;
        this.timeControl = {
            enabled: false,
            whiteTime: 60000, // 60 seconds in ms
            blackTime: 60000
        };
        
        // Edit mode
        this.editMode = false;
        this.selectedPiece = PIECE.WHITE; // Default piece for edit mode
        
        // Game state flags
        this.gameInitialized = false;
        this.aiThinking = false;
        this.gameInProgress = true;
        
        this.initializeGame();
    }
    
async initializeGame() {
    try {
        // Update loading status
        const updateLoadingStatus = (message) => {
            const statusEl = document.getElementById('loading-status');
            if (statusEl) statusEl.textContent = message;
        };

        updateLoadingStatus('Initializing board...');
        this.board.initialize();
        
        updateLoadingStatus('Setting up UI...');
        this.ui.initialize();
        
        updateLoadingStatus('Loading Grandmaster AI engine...');
        // Initialize AI with error handling
        await this.ai.initialize();
        
        updateLoadingStatus('Setting up game controls...');
        this.setupEventListeners();
        this.setupEditMode();
        
        updateLoadingStatus('Finalizing...');
        this.updateView();
        this.startGameTimer();
        
        this.gameInitialized = true;
        window.gameController = this; // For debugging
        
        // Check if AI should make the first move
        this.checkIfAITurn();
        
        // Success notification
        this.notification.success("Grandmaster AI initialized successfully!", { duration: 3000 });
        
        // Hide loading screen with a small delay for smooth transition
        setTimeout(() => {
            if (window.hideLoadingScreen) {
                window.hideLoadingScreen();
            }
        }, 500);
        
    } catch (error) {
        console.error('Game initialization error:', error);
        
        // Hide loading screen even on error
        if (window.hideLoadingScreen) {
            window.hideLoadingScreen();
        }
        
        this.notification.error("Failed to initialize game. Please refresh the page.", { 
            duration: 0, 
            closable: true 
        });
    }
}
    
    setupEventListeners() {
        // Board events
        this.board.on('squareSelected', (square) => this.handleSquareSelection(square));
        this.board.on('moveAttempt', (moveData) => this.handleMoveAttempt(moveData));
        this.board.on('dragDropMove', (moveData) => this.handleMoveAttempt(moveData));
        this.board.on('editSquare', (square) => this.handleEditSquare(square));
        
        // UI events
        this.ui.on('difficultyChange', (level) => this.handleDifficultyChange(level));
        this.ui.on('editModeToggle', () => this.toggleEditMode());
        this.ui.on('undo', () => this.handleUndo());
        this.ui.on('redo', () => this.handleRedo());
        this.ui.on('firstMove', () => this.handleHistoryChange(() => this.history.jumpToStart()));
        this.ui.on('lastMove', () => this.handleHistoryChange(() => this.history.jumpToEnd()));
        this.ui.on('prevMove', () => this.handleHistoryChange(() => this.history.previousMove()));
        this.ui.on('nextMove', () => this.handleHistoryChange(() => this.history.nextMove()));
        this.ui.on('jumpToMove', (index) => this.handleHistoryChange(() => this.history.jumpToMove(index)));
        this.ui.on('importFEN', () => this.importFEN());
        this.ui.on('exportFEN', () => this.exportFEN());
        this.ui.on('savePNG', () => this.board.saveAsPNG());
        
        // Game rule controls
        this.setupGameRuleControls();
        
        // Error handling for uncaught errors
        window.addEventListener('error', (event) => {
            console.error('Uncaught error:', event.error);
            this.notification.error('An unexpected error occurred. Please check the console.', { duration: 5000 });
        });
        
        // Handle page unload during AI thinking
        window.addEventListener('beforeunload', () => {
            if (this.aiThinking) {
                this.ai.abortSearch();
            }
        });
    }
    
    setupGameRuleControls() {
        // Maximum capture rule checkbox
        const maxCaptureEl = document.getElementById('max-capture-rule');
        if (maxCaptureEl) {
            // Set initial state to match game default (false)
            maxCaptureEl.checked = false;
            
            maxCaptureEl.addEventListener('change', (e) => {
                try {
                    this.game.setMaxCaptureRule(e.target.checked);
                    this.updateView(); // Refresh legal moves highlighting
                    const status = e.target.checked ? 'enabled' : 'disabled';
                    this.notification.info(`Maximum capture rule ${status}`, { duration: 2000 });
                } catch (error) {
                    console.error('Error setting max capture rule:', error);
                    this.notification.error('Failed to update capture rule', { duration: 2000 });
                }
            });
        }
        
        // Time control checkbox
        const timeControlEl = document.getElementById('time-control');
        if (timeControlEl) {
            timeControlEl.addEventListener('change', (e) => {
                try {
                    this.timeControl.enabled = e.target.checked;
                    if (this.timeControl.enabled) {
                        this.timeControl.whiteTime = 60000;
                        this.timeControl.blackTime = 60000;
                        this.notification.info("Time control enabled: 60 seconds per move", { duration: 2000 });
                    } else {
                        this.notification.info("Time control disabled", { duration: 2000 });
                    }
                    this.updateView();
                } catch (error) {
                    console.error('Error setting time control:', error);
                    this.notification.error('Failed to update time control', { duration: 2000 });
                }
            });
        }
    }
    
    async handleDifficultyChange(level) {
        try {
            await this.ai.setDifficulty(level);
            this.isPlayerVsAI = true;
            this.notification.info(`AI level set to ${level}. New game started.`, { duration: 3000 });
            this.resetGame();
        } catch (error) {
            console.error('Error changing difficulty:', error);
            this.notification.error('Failed to change AI difficulty', { duration: 2000 });
        }
    }
    
    resetGame() {
        try {
            // Stop any ongoing AI thinking
            if (this.aiThinking) {
                this.ai.abortSearch();
                this.aiThinking = false;
            }
            
            this.game.reset();
            this.history.clear();
            this.timeControl.whiteTime = 60000;
            this.timeControl.blackTime = 60000;
            this.gameInProgress = true;
            this.updateView();
            
            // Small delay before checking AI turn to ensure UI is updated
            setTimeout(() => this.checkIfAITurn(), 100);
            
        } catch (error) {
            console.error('Error resetting game:', error);
            this.notification.error('Failed to reset game', { duration: 3000 });
        }
    }
    
    checkIfAITurn() {
        if (!this.gameInitialized || !this.gameInProgress || this.editMode || this.aiThinking) {
            return;
        }
        
        if (this.isPlayerVsAI && this.game.currentPlayer === PLAYER.BLACK && this.game.gameState === GAME_STATE.ONGOING) {
            this.triggerAIMove();
        }
    }
    
    handleSquareSelection(square) {
        if (!this.gameInProgress || this.aiThinking || this.editMode) return;
        
        try {
            const legalMoves = this.game.getLegalMoves().filter(m => 
                m.from.row === square.row && m.from.col === square.col
            );
            this.board.highlightLegalMoves(legalMoves);
            
            // Start tracking thinking time for human player
            if (this.isPlayerVsAI && this.game.currentPlayer === PLAYER.WHITE) {
                this.moveStartTime = Date.now();
            }
        } catch (error) {
            console.error('Error handling square selection:', error);
            this.notification.error('Error selecting square', { duration: 2000 });
        }
    }
    
    handleMoveAttempt(moveData) {
        if (!this.gameInProgress || this.aiThinking) {
            this.notification.warning("Please wait for AI to move", { duration: 1500 });
            return;
        }
        
        if (this.isPlayerVsAI && this.game.currentPlayer !== PLAYER.WHITE) {
            this.notification.error("Not your turn!", { duration: 1500 });
            return;
        }
        
        // Handle clicking the same square (deselect)
        if (moveData.from.row === moveData.to.row && moveData.from.col === moveData.to.col) {
            this.board.clearSelection();
            this.board.clearHighlights();
            return;
        }
        
        try {
            const legalMoves = this.game.getLegalMoves();
            const attemptedMove = legalMoves.find(m => 
                m.from.row === moveData.from.row && 
                m.from.col === moveData.from.col && 
                m.to.row === moveData.to.row && 
                m.to.col === moveData.to.col
            );
            
            if (attemptedMove) {
                this.executeMove(attemptedMove);
            } else {
                this.notification.error("Invalid move.", { duration: 2000 });
                this.board.clearSelection();
                this.board.clearHighlights();
            }
        } catch (error) {
            console.error('Error handling move attempt:', error);
            this.notification.error('Error processing move', { duration: 2000 });
        }
    }
    
    executeMove(move) {
        try {
            // Calculate thinking time
            const thinkingTime = this.moveStartTime ? Date.now() - this.moveStartTime : 0;
            
            // Make the move with thinking time
            const success = this.game.makeMove(move, thinkingTime);
            if (!success) {
                this.notification.error("Failed to execute move", { duration: 2000 });
                return;
            }
            
            // Reset timer for the player who just moved
            if (this.timeControl.enabled) {
                if (this.game.currentPlayer === PLAYER.BLACK) { // Just moved was white
                    this.timeControl.whiteTime = 60000; // Reset to 60 seconds
                } else {
                    this.timeControl.blackTime = 60000; // Reset to 60 seconds
                }
            }
            
            // Record move in history
            const lastMoveRecord = this.game.moveHistory[this.game.moveHistory.length - 1];
            this.history.recordMove(lastMoveRecord);
            
            this.updateView();
            
            // Check for 50-move rule warning
            if (this.game.getMovesSinceCapture() >= 40) {
                const movesLeft = 50 - this.game.getMovesSinceCapture();
                this.notification.warning(`Warning: ${movesLeft} moves until automatic draw!`, { duration: 3000 });
            }
            
            // Check game over
            if (this.game.gameState !== GAME_STATE.ONGOING) {
                this.handleGameOver();
                return;
            }
            
            // Trigger AI move if necessary
            if (this.isPlayerVsAI && this.game.currentPlayer === PLAYER.BLACK) {
                // Small delay to allow UI to update
                setTimeout(() => this.triggerAIMove(), 100);
            }
            
            // Reset move start time for next player
            this.moveStartTime = Date.now();
            
        } catch (error) {
            console.error('Error executing move:', error);
            this.notification.error('Failed to execute move', { duration: 3000 });
        }
    }
    
    async triggerAIMove() {
        if (this.aiThinking || !this.gameInProgress) return;
        
        try {
            this.aiThinking = true;
            this.notification.info("Grandmaster AI is analyzing...", { duration: 0 });
            const aiStartTime = Date.now();
            
            const moveHistoryNotations = this.history.getHistory().map(h => h.notation);
            const aiMove = await this.ai.getMove(this.game, moveHistoryNotations);
            
            // Check if game state changed while AI was thinking
            if (!this.gameInProgress || this.game.gameState !== GAME_STATE.ONGOING) {
                this.aiThinking = false;
                this.notification.closeCurrent();
                return;
            }
            
            const aiThinkingTime = Date.now() - aiStartTime;
            this.notification.closeCurrent();
            
            if (aiMove) {
                this.notification.success(`AI plays ${this.game.getMoveNotation(aiMove)}`, { duration: 2500 });
                
                // Set thinking time for AI move
                this.moveStartTime = aiStartTime;
                
                // Execute AI move with a small delay for better UX
                setTimeout(() => {
                    this.aiThinking = false;
                    this.executeMove(aiMove);
                }, 300);
            } else {
                this.aiThinking = false;
                this.notification.error("AI could not find a move.", { duration: 3000 });
                this.handleGameOver();
            }
            
        } catch (error) {
            this.aiThinking = false;
            console.error('AI move error:', error);
            this.notification.error('AI encountered an error', { duration: 3000 });
        }
    }
    
    updateView() {
        try {
            this.board.updatePosition(this.game);
            this.board.clearHighlights();
            this.board.clearSelection();
            
            // Update move history with enhanced formatting
            this.ui.updateMoveHistory(this.history.getHistory(), this.history.getCurrentIndex());
            
            // Update game statistics
            const stats = this.game.getGameStatistics();
            this.ui.updateGameStatistics(stats);
            
            // Update position info
            const tension = this.game.getTension();
            const isQuiet = this.game.isQuietPosition();
            this.ui.updatePositionInfo(tension, isQuiet);
            
            // Note: AI evaluation updates are now handled via worker messages
            
            // Update timers if time control is enabled
            if (this.timeControl.enabled) {
                this.ui.updateTimers(this.timeControl.whiteTime, this.timeControl.blackTime);
            }
            
        } catch (error) {
            console.error('Error updating view:', error);
        }
    }
    
    startGameTimer() {
        if (this.gameTimer) clearInterval(this.gameTimer);
        
        this.gameTimer = setInterval(() => {
            try {
                if (this.timeControl.enabled && this.game.gameState === GAME_STATE.ONGOING && 
                    !this.editMode && this.gameInProgress) {
                    
                    // Only decrement time for the current player
                    if (this.game.currentPlayer === PLAYER.WHITE && !this.aiThinking) {
                        this.timeControl.whiteTime -= 100;
                        if (this.timeControl.whiteTime <= 0) {
                            this.timeControl.whiteTime = 0;
                            this.handleTimeOut(PLAYER.WHITE);
                        }
                    } else if (this.game.currentPlayer === PLAYER.BLACK && this.aiThinking) {
                        this.timeControl.blackTime -= 100;
                        if (this.timeControl.blackTime <= 0) {
                            this.timeControl.blackTime = 0;
                            this.handleTimeOut(PLAYER.BLACK);
                        }
                    }
                    
                    this.ui.updateTimers(this.timeControl.whiteTime, this.timeControl.blackTime);
                }
            } catch (error) {
                console.error('Timer error:', error);
            }
        }, 100); // Update every 100ms
    }
    
    handleTimeOut(player) {
        try {
            this.gameInProgress = false;
            this.game.gameState = player === PLAYER.WHITE ? GAME_STATE.BLACK_WIN : GAME_STATE.WHITE_WIN;
            this.notification.error(`${player === PLAYER.WHITE ? 'White' : 'Black'} ran out of time!`, { duration: 5000 });
            this.handleGameOver();
        } catch (error) {
            console.error('Error handling timeout:', error);
        }
    }
    
    handleUndo() {
        if (this.aiThinking) {
            this.notification.warning("Cannot undo while AI is thinking", { duration: 2000 });
            return;
        }
        
        try {
            if (this.history.undo()) {
                this.updateView();
                this.notification.info("Move undone", { duration: 1500 });
                
                // In player vs AI, we might need to undo AI's move too
                if (this.isPlayerVsAI && this.game.currentPlayer === PLAYER.BLACK && this.history.canUndo()) {
                    this.history.undo();
                    this.updateView();
                }
            } else {
                this.notification.warning("Cannot undo: at start of game", { duration: 1500 });
            }
        } catch (error) {
            console.error('Error during undo:', error);
            this.notification.error('Failed to undo move', { duration: 2000 });
        }
    }
    
    handleRedo() {
        if (this.aiThinking) {
            this.notification.warning("Cannot redo while AI is thinking", { duration: 2000 });
            return;
        }
        
        try {
            if (this.history.redo()) {
                this.updateView();
                this.notification.info("Move redone", { duration: 1500 });
            } else {
                this.notification.warning("Cannot redo: no future moves", { duration: 1500 });
            }
        } catch (error) {
            console.error('Error during redo:', error);
            this.notification.error('Failed to redo move', { duration: 2000 });
        }
    }
    
    handleHistoryChange(historyFunction) {
        if (this.aiThinking) {
            this.notification.warning("Cannot navigate history while AI is thinking", { duration: 2000 });
            return;
        }
        
        try {
            historyFunction();
            this.updateView();
        } catch (error) {
            console.error('Error during history navigation:', error);
            this.notification.error('Failed to navigate history', { duration: 2000 });
        }
    }
    
    handleGameOver() {
        try {
            this.gameInProgress = false;
            clearInterval(this.gameTimer);
            
            let message = "Game Over!";
            
            if (this.game.gameState === GAME_STATE.WHITE_WIN) {
                message = "White Wins!";
            } else if (this.game.gameState === GAME_STATE.BLACK_WIN) {
                message = "Black Wins!";
            } else if (this.game.gameState === GAME_STATE.DRAW) {
                // Determine draw reason
                if (this.game.getMovesSinceCapture() >= 50) {
                    message = "Draw by 50-move rule!";
                    this.ui.showDrawReason('fifty-move');
                } else if (this.game.isDrawByRepetition()) {
                    message = "Draw by threefold repetition!";
                    this.ui.showDrawReason('repetition');
                } else if (this.game.isDrawByMaterial()) {
                    message = "Draw by insufficient material!";
                    this.ui.showDrawReason('material');
                } else {
                    message = "The game is a draw!";
                    this.ui.showDrawReason('blockade');
                }
            }
            
            // Show game statistics
            const stats = this.game.getGameStatistics();
            const duration = Math.floor(stats.duration / 1000);
            const totalMoves = stats.totalMoves;
            
            message += `\n\nGame duration: ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`;
            message += `\nTotal moves: ${totalMoves}`;
            message += `\nWhite captures: ${stats.captures[PLAYER.WHITE]}`;
            message += `\nBlack captures: ${stats.captures[PLAYER.BLACK]}`;
            
            this.notification.success(message, { duration: 15000, closable: true });
            
        } catch (error) {
            console.error('Error handling game over:', error);
        }
    }
    
    async importFEN() {
        if (this.aiThinking) {
            this.notification.warning("Cannot import FEN while AI is thinking", { duration: 2000 });
            return;
        }
        
        try {
            const fen = await this.ui.getFENInput();
            if (fen && this.game.loadFEN(fen)) {
                this.history.clear();
                this.gameInProgress = true;
                this.updateView();
                this.notification.success("Position loaded from FEN.", { duration: 2000 });
                this.checkIfAITurn();
            } else if (fen) {
                this.notification.error("Invalid FEN string provided.", { duration: 3000 });
            }
        } catch (error) {
            console.error('Error importing FEN:', error);
            this.notification.error('Failed to import FEN', { duration: 3000 });
        }
    }
    
    exportFEN() {
        try {
            this.ui.showFEN(this.game.getFEN());
        } catch (error) {
            console.error('Error exporting FEN:', error);
            this.notification.error('Failed to export FEN', { duration: 3000 });
        }
    }
    
    // Edit Mode Methods
    setupEditMode() {
        const editPanel = document.getElementById('edit-panel');
        if (!editPanel) return;
        
        // Piece selector buttons
        const pieceButtons = editPanel.querySelectorAll('.piece-btn');
        pieceButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                pieceButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedPiece = parseInt(btn.dataset.piece);
            });
        });
        
        // Clear board button
        document.getElementById('clear-board')?.addEventListener('click', () => {
            try {
                for (let r = 0; r < BOARD_SIZE; r++) {
                    for (let c = 0; c < BOARD_SIZE; c++) {
                        this.game.setPiece(r, c, PIECE.NONE);
                    }
                }
                this.updateView();
                this.notification.info('Board cleared', { duration: 2000 });
            } catch (error) {
                console.error('Error clearing board:', error);
                this.notification.error('Failed to clear board', { duration: 2000 });
            }
        });
        
        // Reset position button
        document.getElementById('reset-position')?.addEventListener('click', () => {
            try {
                this.game.setupInitialPosition();
                this.updateView();
                this.notification.info('Position reset to starting position', { duration: 2000 });
            } catch (error) {
                console.error('Error resetting position:', error);
                this.notification.error('Failed to reset position', { duration: 2000 });
            }
        });
        
        // Start game button
        document.getElementById('start-game')?.addEventListener('click', () => {
            try {
                const firstPlayer = document.getElementById('first-player')?.value;
                if (firstPlayer) {
                    this.game.currentPlayer = parseInt(firstPlayer);
                }
                
                this.toggleEditMode(false);
                this.game.gameMode = GAME_MODE.NORMAL;
                this.game.updateGameState();
                this.history.clear();
                this.gameInProgress = true;
                
                // Generate initial FEN and add to history
                const initialFEN = this.game.getFEN();
                this.history.recordMove({
                    notation: 'Start',
                    fen: initialFEN,
                    from: null,
                    to: null,
                    piece: null,
                    captures: [],
                    player: this.game.currentPlayer,
                    moveNumber: 0
                });
                
                this.notification.success('Game started from custom position!', { duration: 3000 });
                this.checkIfAITurn();
            } catch (error) {
                console.error('Error starting game from edit mode:', error);
                this.notification.error('Failed to start game', { duration: 3000 });
            }
        });
    }
    
    toggleEditMode(force = null) {
        try {
            this.editMode = force !== null ? force : !this.editMode;
            
            const editPanel = document.getElementById('edit-panel');
            const editButton = document.getElementById('edit-mode');
            
            if (this.editMode) {
                // Stop AI if thinking
                if (this.aiThinking) {
                    this.ai.abortSearch();
                    this.aiThinking = false;
                    this.notification.closeCurrent();
                }
                
                // Enter edit mode
                this.board.setEditMode(true);
                this.game.gameMode = GAME_MODE.EDIT;
                editPanel.style.display = 'block';
                editButton.classList.add('active');
                document.body.classList.add('edit-mode-active');
                this.notification.info('Edit mode enabled - Click squares to place pieces', { duration: 3000 });
                
                // Stop game timer in edit mode
                clearInterval(this.gameTimer);
            } else {
                // Exit edit mode
                this.board.setEditMode(false);
                editPanel.style.display = 'none';
                editButton.classList.remove('active');
                document.body.classList.remove('edit-mode-active');
                
                // Restart game timer
                this.startGameTimer();
            }
        } catch (error) {
            console.error('Error toggling edit mode:', error);
            this.notification.error('Failed to toggle edit mode', { duration: 2000 });
        }
    }
    
    handleEditSquare(square) {
        if (!this.editMode) return;
        
        try {
            const currentPiece = this.game.getPiece(square.row, square.col);
            
            if (this.selectedPiece === PIECE.NONE || currentPiece === this.selectedPiece) {
                // Clear the square
                this.game.setPiece(square.row, square.col, PIECE.NONE);
            } else {
                // Place the selected piece
                this.game.setPiece(square.row, square.col, this.selectedPiece);
            }
            
            this.updateView();
        } catch (error) {
            console.error('Error handling edit square:', error);
            this.notification.error('Failed to edit square', { duration: 2000 });
        }
    }
    
    // Public methods for external access
    getCurrentGame() {
        return this.game;
    }
    
    getCurrentHistory() {
        return this.history;
    }
    
    isAIThinking() {
        return this.aiThinking;
    }
    
    // Method to gracefully shutdown the game
    shutdown() {
        try {
            if (this.aiThinking) {
                this.ai.abortSearch();
            }
            clearInterval(this.gameTimer);
            this.notification.closeCurrent();
            this.ai.terminate(); // Terminate the worker
        } catch (error) {
            console.error('Error during shutdown:', error);
        }
    }
}

// Initialize game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    try {
        new GameController();
    } catch (error) {
        console.error('Failed to start game:', error);
        // Create a basic error notification without the full notification system
        const errorDiv = document.createElement('div');
        errorDiv.innerHTML = `
            <div style="position: fixed; top: 20px; right: 20px; background: #e74c3c; color: white; padding: 15px; border-radius: 5px; z-index: 10000;">
                Failed to start game. Please refresh the page.<br>
                <small>Check browser console for details.</small>
            </div>
        `;
        document.body.appendChild(errorDiv);
    }
});