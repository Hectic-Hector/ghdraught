/**
 * Board class for hectic-game - ENHANCED VERSION
 * - Renders the wooden board and pieces using image assets
 * - Includes fully functional drag-and-drop logic that emits events
 * - Enhanced with visual indicators for game state
 * - FIXED: Pieces now truly fill 80% of squares with aggressive sizing
 * @author codewithheck
 * Enhanced for better gameplay experience
 */

import { BOARD_SIZE, PIECE, isDarkSquare, SQUARE_NUMBERS } from '../engine/constants.js';

export class Board {
    constructor() {
        this.container = null;
        this.listeners = new Map();
        this.editMode = false;
        this.selectedSquare = null;
        
        this.totalBoardSize = 600;
        this.borderSize = 14;
        this.playingAreaSize = this.totalBoardSize - (this.borderSize * 2);
        this.squareSize = this.playingAreaSize / BOARD_SIZE;
        
        // Enhanced features
        this.showSquareNumbers = true;
        this.lastMoveSquares = null;
        this.checkSquare = null;
    }

    initialize() {
        this.container = document.getElementById('game-board');
        if (!this.container) { 
            console.error('Game board container not found'); 
            return; 
        }
        this.createBoard();
        this.attachEventListeners();
    }

    createBoard() {
        this.container.innerHTML = '';
        this.container.style.position = 'relative';
        this.container.style.width = `${this.totalBoardSize}px`;
        this.container.style.height = `${this.totalBoardSize}px`;
        this.container.style.backgroundImage = 'url("assets/images/flipped_board.jpg")';
        this.container.style.backgroundSize = 'cover';
        this.container.style.backgroundPosition = 'center';

        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                const square = document.createElement('div');
                square.className = 'board-square';
                square.style.position = 'absolute';
                square.style.width = `${this.squareSize}px`;
                square.style.height = `${this.squareSize}px`;
                square.style.left = `${this.borderSize + (col * this.squareSize)}px`;
                square.style.top = `${this.borderSize + (row * this.squareSize)}px`;
                square.dataset.row = row;
                square.dataset.col = col;
                square.style.backgroundColor = 'transparent';
                square.style.cursor = 'pointer';
                
                if (isDarkSquare(row, col)) {
                    square.classList.add('playable');
                    
                    // Add square numbers if enabled
                    if (this.showSquareNumbers) {
                        const number = SQUARE_NUMBERS[row * BOARD_SIZE + col];
                        const numberEl = document.createElement('div');
                        numberEl.className = 'square-number';
                        numberEl.textContent = number;
                        numberEl.style.cssText = `
                            position: absolute;
                            bottom: 2px;
                            right: 2px;
                            font-size: 11px;
                            color: rgba(255, 255, 255, 0.7);
                            font-weight: bold;
                            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
                            pointer-events: none;
                            user-select: none;
                            z-index: 5;
                        `;
                        square.appendChild(numberEl);
                    }
                }
                
                this.container.appendChild(square);
            }
        }
    }

    attachEventListeners() {
        this.container.addEventListener('click', (event) => {
            const square = event.target.closest('.board-square');
            if (square) {
                this.handleSquareClick(
                    parseInt(square.dataset.row, 10), 
                    parseInt(square.dataset.col, 10)
                );
            }
        });

        // Add hover effect for edit mode
        this.container.addEventListener('mouseover', (event) => {
            if (!this.editMode) return;
            
            const square = event.target.closest('.board-square');
            if (square && isDarkSquare(
                parseInt(square.dataset.row, 10),
                parseInt(square.dataset.col, 10)
            )) {
                square.classList.add('edit-hover');
            }
        });

        this.container.addEventListener('mouseout', (event) => {
            const square = event.target.closest('.board-square');
            if (square) {
                square.classList.remove('edit-hover');
            }
        });

        // Drag and drop listeners
        this.container.addEventListener('dragstart', (event) => {
            const piece = event.target.closest('.piece');
            if (!piece) return;
            
            const square = piece.parentElement;
            const row = parseInt(square.dataset.row, 10);
            const col = parseInt(square.dataset.col, 10);
            
            event.dataTransfer.setData('application/json', JSON.stringify({ row, col }));
            event.dataTransfer.effectAllowed = 'move';
            
            // Add dragging class for visual feedback
            piece.classList.add('dragging');
            
            setTimeout(() => { 
                piece.style.visibility = 'hidden'; 
            }, 0);
            
            this.selectSquare(row, col);
            this.emit('squareSelected', { row, col });
        });

        this.container.addEventListener('dragover', (event) => {
            event.preventDefault();
            
            // Add hover effect on valid drop targets
            const square = event.target.closest('.board-square');
            if (square && square.classList.contains('legal-move')) {
                square.classList.add('drop-target');
            }
        });

        this.container.addEventListener('dragleave', (event) => {
            const square = event.target.closest('.board-square');
            if (square) {
                square.classList.remove('drop-target');
            }
        });

        this.container.addEventListener('drop', (event) => {
            event.preventDefault();
            
            const toSquare = event.target.closest('.board-square');
            if (!toSquare) return;

            toSquare.classList.remove('drop-target');
            
            const toRow = parseInt(toSquare.dataset.row, 10);
            const toCol = parseInt(toSquare.dataset.col, 10);
            
            try {
                const fromData = JSON.parse(event.dataTransfer.getData('application/json'));
                this.emit('dragDropMove', {
                    from: { row: fromData.row, col: fromData.col },
                    to: { row: toRow, col: toCol }
                });
            } catch (e) {
                console.error("Error processing drop data:", e);
            }
        });

        this.container.addEventListener('dragend', (event) => {
            // Clean up
            this.container.querySelectorAll('.piece').forEach(p => {
                p.style.visibility = 'visible';
                p.classList.remove('dragging');
            });
            this.container.querySelectorAll('.drop-target').forEach(sq => {
                sq.classList.remove('drop-target');
            });
            this.clearSelection();
            this.clearHighlights();
        });
    }

    handleSquareClick(row, col) {
        if (this.editMode) {
            // In edit mode, emit edit event
            if (isDarkSquare(row, col)) {
                this.emit('editSquare', { row, col });
            }
            return;
        }
        
        if (this.selectedSquare) {
            this.emit('moveAttempt', { 
                from: this.selectedSquare, 
                to: { row, col } 
            });
            this.clearSelection();
            this.clearHighlights();
        } else {
            if (this.getPieceAt(row, col)) {
                this.selectSquare(row, col);
                this.emit('squareSelected', { row, col });
            }
        }
    }

    selectSquare(row, col) {
        this.clearSelection();
        this.selectedSquare = { row, col };
        const square = this.container.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        if (square) {
            square.classList.add('selected');
        }
    }

    clearSelection() {
        if (this.selectedSquare) {
            const square = this.container.querySelector(
                `[data-row="${this.selectedSquare.row}"][data-col="${this.selectedSquare.col}"]`
            );
            if (square) {
                square.classList.remove('selected');
            }
        }
        this.selectedSquare = null;
    }

    getPieceAt(row, col) {
        const square = this.container.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        return square ? square.querySelector('.piece') : null;
    }

    updatePosition(game) {
        // Remove all pieces
        this.container.querySelectorAll('.piece').forEach(p => p.remove());
        
        // Place pieces
        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                const pieceType = game.getPiece(row, col);
                if (pieceType && pieceType !== PIECE.NONE) {
                    this.createPiece(row, col, pieceType);
                }
            }
        }
        
        // Show last move indicator
        if (game.moveHistory && game.moveHistory.length > 0) {
            const lastMove = game.moveHistory[game.moveHistory.length - 1];
            this.highlightLastMove(lastMove);
        }
    }

    createPiece(row, col, pieceType) {
        const square = this.container.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        if (!square) return;
        
        const pieceEl = document.createElement('div');
        pieceEl.className = 'piece';
        
        // AGGRESSIVE SIZING: Make pieces 95% of square size to compensate for image padding
        const pieceSize = this.squareSize * 0.95;
        const offsetX = (this.squareSize - pieceSize) / 2;
        const offsetY = (this.squareSize - pieceSize) / 2;
        
        let imageUrl = '';
        switch (pieceType) {
            case PIECE.WHITE: 
                imageUrl = 'assets/images/white_piece.png'; 
                pieceEl.classList.add('white-piece');
                break;
            case PIECE.BLACK: 
                imageUrl = 'assets/images/black_piece.png'; 
                pieceEl.classList.add('black-piece');
                break;
            case PIECE.WHITE_KING: 
                imageUrl = 'assets/images/white_king.png'; 
                pieceEl.classList.add('white-king');
                break;
            case PIECE.BLACK_KING: 
                imageUrl = 'assets/images/black_king.png'; 
                pieceEl.classList.add('black-king');
                break;
        }
        
        // Enhanced styles for maximum piece visibility
        pieceEl.style.cssText = `
            position: absolute; 
            width: ${pieceSize}px !important; 
            height: ${pieceSize}px !important; 
            left: ${offsetX}px; 
            top: ${offsetY}px; 
            cursor: grab; 
            z-index: 10; 
            background-image: url("${imageUrl}"); 
            background-size: 100% 100% !important; 
            background-repeat: no-repeat; 
            background-position: center center; 
            image-rendering: -webkit-optimize-contrast;
            image-rendering: crisp-edges;
            filter: drop-shadow(0 3px 6px rgba(0,0,0,0.4));
            transition: transform 0.2s ease;
        `;
        
        pieceEl.draggable = true;
        
        // Add hover effect
        pieceEl.addEventListener('mouseenter', () => {
            pieceEl.style.transform = 'scale(1.05)';
        });
        
        pieceEl.addEventListener('mouseleave', () => {
            if (!pieceEl.classList.contains('dragging')) {
                pieceEl.style.transform = 'scale(1)';
            }
        });
        
        square.appendChild(pieceEl);
    }

    highlightLegalMoves(moves) {
        this.clearHighlights();
        moves.forEach(move => {
            const square = this.container.querySelector(
                `[data-row="${move.to.row}"][data-col="${move.to.col}"]`
            );
            if (square) {
                square.classList.add('legal-move');
                
                // Add different highlight for captures
                if (move.captures && move.captures.length > 0) {
                    square.classList.add('capture-move');
                }
            }
        });
    }

    highlightLastMove(move) {
        // Clear previous last move highlights
        this.container.querySelectorAll('.last-move-from, .last-move-to').forEach(sq => {
            sq.classList.remove('last-move-from', 'last-move-to');
        });
        
        if (!move || !move.from || !move.to) return;
        
        // Highlight from square
        const fromSquare = this.container.querySelector(
            `[data-row="${move.from.row}"][data-col="${move.from.col}"]`
        );
        if (fromSquare) {
            fromSquare.classList.add('last-move-from');
        }
        
        // Highlight to square
        const toSquare = this.container.querySelector(
            `[data-row="${move.to.row}"][data-col="${move.to.col}"]`
        );
        if (toSquare) {
            toSquare.classList.add('last-move-to');
        }
    }

    clearHighlights() {
        this.container.querySelectorAll('.legal-move, .capture-move').forEach(sq => {
            sq.classList.remove('legal-move', 'capture-move');
        });
    }

    setEditMode(enabled) { 
        this.editMode = enabled;
        if (enabled) {
            this.container.classList.add('edit-mode');
        } else {
            this.container.classList.remove('edit-mode');
        }
    }
    
    toggleSquareNumbers(show) {
        this.showSquareNumbers = show;
        this.createBoard(); // Recreate board with/without numbers
    }
    
    async saveAsPNG() {
        if (typeof html2canvas !== 'undefined') {
            try {
                const canvas = await html2canvas(this.container);
                const link = document.createElement('a');
                link.download = `draughts-position-${Date.now()}.png`;
                link.href = canvas.toDataURL();
                link.click();
            } catch (e) { 
                console.error('Failed to save PNG:', e); 
            }
        } else { 
            console.error('html2canvas not loaded'); 
        }
    }

    on(event, callback) { 
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []); 
        }
        this.listeners.get(event).push(callback); 
    }
    
    emit(event, data) { 
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(cb => cb(data)); 
        }
    }
}