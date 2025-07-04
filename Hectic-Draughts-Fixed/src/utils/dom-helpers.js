/**
 * DOM Helper Functions
 * @author codewithheck
 * Created: 2025-06-16 20:40:12 UTC
 */

/**
 * Creates a DOM element with specified attributes and properties
 * @param {string} tag - HTML tag name
 * @param {Object} attributes - HTML attributes
 * @param {Object} properties - Element properties
 * @returns {HTMLElement}
 */
export function createElement(tag, attributes = {}, properties = {}) {
    const element = document.createElement(tag);
    
    // Set attributes
    Object.entries(attributes).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
            element.setAttribute(key, value);
        }
    });
    
    // Set properties
    Object.entries(properties).forEach(([key, value]) => {
        element[key] = value;
    });
    
    return element;
}

/**
 * Creates a game board square element
 * @param {number} row - Row index
 * @param {number} col - Column index
 * @param {boolean} isDark - Whether square is dark
 * @returns {HTMLElement}
 */
export function createSquare(row, col, isDark) {
    return createElement('div', {
        class: `square ${isDark ? 'dark' : 'light'}`,
        'data-row': row,
        'data-col': col,
        'data-square': `${row}-${col}`
    });
}

/**
 * Creates a game piece element
 * @param {number} pieceType - Type of piece from PIECE enum
 * @param {boolean} isKing - Whether piece is a king
 * @returns {HTMLElement}
 */
export function createPiece(pieceType, isKing) {
    const piece = createElement('div', {
        class: `piece ${pieceType === 2 ? 'black' : 'white'}${isKing ? ' king' : ''}`,
        draggable: 'true'
    });

    if (isKing) {
        const crown = createElement('div', {
            class: 'crown'
        });
        piece.appendChild(crown);
    }

    return piece;
}

/**
 * Updates the timer display
 * @param {string} elementId - ID of timer element
 * @param {number} seconds - Seconds remaining
 * @param {boolean} isWarning - Whether to show warning state
 */
export function updateTimer(elementId, seconds, isWarning) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    element.textContent = `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    
    if (isWarning) {
        element.classList.add('warning');
    } else {
        element.classList.remove('warning');
    }
}

/**
 * Updates the move history display
 * @param {string} elementId - ID of history element
 * @param {Array} moves - Array of moves
 * @param {number} currentMove - Current move index
 */
export function updateMoveHistory(elementId, moves, currentMove) {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.innerHTML = '';
    moves.forEach((move, index) => {
        const moveElement = createElement('div', {
            class: `move${index === currentMove ? ' current' : ''}`,
            'data-move': index
        }, {
            textContent: `${Math.floor(index/2) + 1}. ${move.notation}`
        });
        element.appendChild(moveElement);
    });

    // Scroll to current move
    if (currentMove >= 0) {
        const currentElement = element.querySelector('.current');
        if (currentElement) {
            currentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

/**
 * Shows a notification message
 * @param {string} message - Message to display
 * @param {string} type - Message type (info, success, warning, error)
 * @param {number} duration - Duration in milliseconds
 */
export function showNotification(message, type = 'info', duration = 3000) {
    const notification = document.getElementById('notification');
    if (!notification) return;

    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.remove('hidden');

    setTimeout(() => {
        notification.classList.add('hidden');
    }, duration);
}

/**
 * Updates the evaluation display
 * @param {string} scoreId - ID of score element
 * @param {string} bestMoveId - ID of best move element
 * @param {Object} evaluation - Evaluation data
 */
export function updateEvaluation(scoreId, bestMoveId, evaluation) {
    const scoreElement = document.getElementById(scoreId);
    const bestMoveElement = document.getElementById(bestMoveId);
    
    if (scoreElement && evaluation.score !== undefined) {
        const score = Math.round(evaluation.score) / 100;
        scoreElement.textContent = score > 0 ? `+${score}` : score;
    }

    if (bestMoveElement && evaluation.bestMove) {
        bestMoveElement.textContent = evaluation.bestMove.notation;
    }
}
