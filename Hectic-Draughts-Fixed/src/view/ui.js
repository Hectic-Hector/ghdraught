export class UI {
    constructor() { 
        this.listeners = new Map(); 
        this.lastUpdateTime = Date.now();
    }
    
    initialize() {
        this.elements = {
            difficultyLevel: document.getElementById('difficulty-level'), 
            editMode: document.getElementById('edit-mode'), 
            undo: document.getElementById('undo'), 
            redo: document.getElementById('redo'), 
            firstMove: document.getElementById('first-move'), 
            lastMove: document.getElementById('last-move'), 
            prevMove: document.getElementById('prev-move'), 
            nextMove: document.getElementById('next-move'), 
            importFEN: document.getElementById('import-fen'), 
            exportFEN: document.getElementById('export-fen'), 
            savePNG: document.getElementById('save-png'), 
            moveHistory: document.getElementById('move-history'), 
            bestMove: document.getElementById('best-move'), 
            evaluationScore: document.getElementById('evaluation-score'), 
            searchDepth: document.getElementById('search-depth'),
            // New elements for enhanced features
            blackCaptured: document.getElementById('black-captured'),
            whiteCaptured: document.getElementById('white-captured'),
            blackTimer: document.getElementById('black-timer'),
            whiteTimer: document.getElementById('white-timer')
        };
        this.attachEventListeners();
    }
    
    attachEventListeners() {
        this.elements.difficultyLevel?.addEventListener('change', (e) => this.emit('difficultyChange', parseInt(e.target.value, 10)));
        this.elements.editMode?.addEventListener('click', () => this.emit('editModeToggle', this.elements.editMode.classList.toggle('active')));
        this.elements.undo?.addEventListener('click', () => this.emit('undo'));
        this.elements.redo?.addEventListener('click', () => this.emit('redo'));
        this.elements.firstMove?.addEventListener('click', () => this.emit('firstMove'));
        this.elements.lastMove?.addEventListener('click', () => this.emit('lastMove'));
        this.elements.prevMove?.addEventListener('click', () => this.emit('prevMove'));
        this.elements.nextMove?.addEventListener('click', () => this.emit('nextMove'));
        this.elements.importFEN?.addEventListener('click', () => this.emit('importFEN'));
        this.elements.exportFEN?.addEventListener('click', () => this.emit('exportFEN'));
        this.elements.savePNG?.addEventListener('click', () => this.emit('savePNG'));
    }
    
    // Enhanced move history with timing and promotion indicators
    updateMoveHistory(history, currentIndex) {
        if (!this.elements.moveHistory) return;
        this.elements.moveHistory.innerHTML = '';
        
        for (let i = 0; i < history.length; i++) {
            const moveRecord = history[i];
            const isWhiteMove = i % 2 === 0;

            if (isWhiteMove) {
                const moveNumber = Math.floor(i / 2) + 1;
                const rowEl = document.createElement('div');
                rowEl.className = 'move-entry';

                const whiteMove = moveRecord;
                const blackMove = history[i + 1];

                // Enhanced notation with timing and promotion
                let whiteNotation = this.formatMoveNotation(whiteMove);
                let blackNotation = blackMove ? this.formatMoveNotation(blackMove) : '';

                let whiteHTML = `<span>${whiteNotation}</span>`;
                let blackHTML = blackMove ? `<span>${blackNotation}</span>` : '';

                // Highlight current move
                if (i === currentIndex) {
                    whiteHTML = `<span style="background-color: #d4edda; border-radius: 3px; padding: 1px 3px;">${whiteNotation}</span>`;
                }
                if (i + 1 === currentIndex && blackMove) {
                    blackHTML = `<span style="background-color: #d4edda; border-radius: 3px; padding: 1px 3px;">${blackNotation}</span>`;
                }

                rowEl.innerHTML = `<span style="color: #888; min-width: 25px; display: inline-block;">${moveNumber}.</span> <span style="display: inline-block; width: 120px;">${whiteHTML}</span> <span style="display: inline-block; width: 120px;">${blackHTML}</span>`;
                
                // Add click handlers for move navigation
                rowEl.addEventListener('click', (e) => {
                    const clickX = e.offsetX;
                    const rowWidth = rowEl.offsetWidth;
                    if (clickX < rowWidth / 2) {
                        this.emit('jumpToMove', i);
                    } else if (blackMove) {
                        this.emit('jumpToMove', i + 1);
                    }
                });
                
                this.elements.moveHistory.appendChild(rowEl);
            }
        }
        this.elements.moveHistory.scrollTop = this.elements.moveHistory.scrollHeight;
    }
    
    formatMoveNotation(move) {
        if (!move || !move.notation) return '--';
        
        let notation = move.notation;
        
        // Add promotion indicator
        if (move.wasPromotion) {
            notation += '♔';
        }
        
        // Add timing if available
        if (move.thinkingTime !== undefined) {
            const timeStr = move.thinkingTime > 1000 ? 
                `${(move.thinkingTime/1000).toFixed(1)}s` : 
                `${move.thinkingTime}ms`;
            notation += ` (${timeStr})`;
        }
        
        return notation;
    }
    
    // Update game statistics display
    updateGameStatistics(stats) {
        if (!stats) return;
        
        // Update captured pieces count
        if (this.elements.whiteCaptured) {
            this.elements.whiteCaptured.textContent = `Captured: ${stats.captures[1]}`;
        }
        if (this.elements.blackCaptured) {
            this.elements.blackCaptured.textContent = `Captured: ${stats.captures[2]}`;
        }
        
        // Update phase indicator (if we add this element)
        const phaseEl = document.getElementById('game-phase');
        if (phaseEl) {
            phaseEl.textContent = stats.currentPosition.phase.charAt(0).toUpperCase() + 
                                 stats.currentPosition.phase.slice(1);
        }
        
        // Update material balance (if we add this element)
        const balanceEl = document.getElementById('material-balance');
        if (balanceEl) {
            const balance = stats.currentPosition.material;
            balanceEl.textContent = balance > 0 ? `+${balance}` : balance.toString();
            balanceEl.style.color = balance > 0 ? '#2ecc71' : balance < 0 ? '#e74c3c' : '#666';
        }
        
        // Update 50-move rule counter (if we add this element)
        const moveRuleEl = document.getElementById('fifty-move-counter');
        if (moveRuleEl) {
            const movesLeft = 50 - stats.currentPosition.movesSinceCapture;
            moveRuleEl.textContent = `${movesLeft} moves until draw`;
            if (movesLeft <= 10) {
                moveRuleEl.style.color = '#e74c3c';
                moveRuleEl.style.fontWeight = 'bold';
            } else {
                moveRuleEl.style.color = '#666';
                moveRuleEl.style.fontWeight = 'normal';
            }
        }
    }
    
    // Update position info display
    updatePositionInfo(tension, isQuiet) {
        const tensionEl = document.getElementById('position-tension');
        if (tensionEl) {
            const tensionLevel = tension === 0 ? 'Quiet' : 
                                tension < 5 ? 'Active' : 
                                'Tactical!';
            tensionEl.textContent = tensionLevel;
            tensionEl.style.color = tension > 5 ? '#e74c3c' : '#666';
        }
    }
    
    updateAnalysis(evaluation) {
        if (this.elements.bestMove && evaluation.bestMove) {
            this.elements.bestMove.textContent = this.aiGetMoveNotation(evaluation.bestMove);
        }
        if (this.elements.evaluationScore && evaluation.score !== undefined) { 
            const score = (evaluation.score / 100).toFixed(2); 
            this.elements.evaluationScore.textContent = score > 0 ? `+${score}` : score;
            
            // Color code the evaluation
            this.elements.evaluationScore.style.color = 
                score > 1 ? '#2ecc71' : 
                score < -1 ? '#e74c3c' : 
                '#666';
        }
        if (this.elements.searchDepth && evaluation.depth !== undefined) {
            this.elements.searchDepth.textContent = evaluation.depth;
        }
        
        // Show cache stats if available
        if (evaluation.cacheStats) {
            const cacheEl = document.getElementById('cache-stats');
            if (cacheEl) {
                cacheEl.textContent = `Cache: ${evaluation.cacheStats.hitRate}`;
            }
        }
    }
    
    // Timer update method
    updateTimers(whiteTime, blackTime) {
        if (this.elements.whiteTimer) {
            this.elements.whiteTimer.textContent = this.formatTime(whiteTime);
            if (whiteTime < 10000) { // Less than 10 seconds
                this.elements.whiteTimer.classList.add('warning');
            } else {
                this.elements.whiteTimer.classList.remove('warning');
            }
        }
        
        if (this.elements.blackTimer) {
            this.elements.blackTimer.textContent = this.formatTime(blackTime);
            if (blackTime < 10000) {
                this.elements.blackTimer.classList.add('warning');
            } else {
                this.elements.blackTimer.classList.remove('warning');
            }
        }
    }
    
    formatTime(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    showDrawReason(reason) {
        let message = 'Game drawn by ';
        switch(reason) {
            case 'repetition':
                message += 'threefold repetition';
                break;
            case 'fifty-move':
                message += '50-move rule';
                break;
            case 'material':
                message += 'insufficient material';
                break;
            case 'blockade':
                message += 'blockade - no legal moves';
                break;
            default:
                message += 'agreement';
        }
        
        const drawReasonEl = document.getElementById('draw-reason');
        if (drawReasonEl) {
            drawReasonEl.textContent = message;
            drawReasonEl.style.display = 'block';
        }
    }
    
    async getFENInput() { 
        return prompt('Enter FEN notation:'); 
    }
    
    showFEN(fen) { 
        prompt('FEN notation (copy this):', fen); 
    }
    
    on(event, cb) { 
        if (!this.listeners.has(event)) this.listeners.set(event, []); 
        this.listeners.get(event).push(cb); 
    }
    
    emit(event, data) { 
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(cb => cb(data)); 
        }
    }
    
    aiGetMoveNotation(move) { 
        if (!move || !move.from || !move.to) return '--'; 
        return `${move.from.row},${move.from.col} -> ${move.to.row},${move.to.col}`; 
    }
}