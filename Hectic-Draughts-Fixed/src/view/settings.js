/**
 * International Draughts Settings Manager
 * Handles game preferences and configurations
 * @author codewithheck
 * Created: 2025-06-16 19:54:53 UTC
 */

import { createElement } from '../utils/dom-helpers.js';

export class Settings {
    constructor() {
        this.storageKey = 'draughts-settings';
        this.defaults = {
            highlightMoves: true,
            showNumbers: true,
            enableDragDrop: true,
            confirmMoves: false,
            theme: 'classic',
            notation: 'numeric' // 'numeric' or 'algebraic'
        };
        
        this.settings = this.loadSettings();
        this.callbacks = new Map();
    }

    loadSettings() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? { ...this.defaults, ...JSON.parse(stored) } : { ...this.defaults };
        } catch (error) {
            console.error('Failed to load settings:', error);
            return { ...this.defaults };
        }
    }

    saveSettings() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
            this.notifyListeners('settingsChanged', this.settings);
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    get(key) {
        return this.settings[key];
    }

    set(key, value) {
        if (this.settings[key] !== value) {
            this.settings[key] = value;
            this.saveSettings();
        }
    }

    resetToDefaults() {
        this.settings = { ...this.defaults };
        this.saveSettings();
    }

    createSettingsPanel() {
        const panel = createElement('div', { class: 'settings-panel' });

        // Highlight Moves toggle
        const highlightMovesContainer = this.createToggleSetting(
            'highlightMoves',
            'Highlight Legal Moves',
            'Show possible moves when a piece is selected'
        );
        panel.appendChild(highlightMovesContainer);

        // Show Numbers toggle
        const showNumbersContainer = this.createToggleSetting(
            'showNumbers',
            'Show Square Numbers',
            'Display square numbers on the board'
        );
        panel.appendChild(showNumbersContainer);

        // Enable Drag & Drop toggle
        const dragDropContainer = this.createToggleSetting(
            'enableDragDrop',
            'Enable Drag & Drop',
            'Allow moving pieces by dragging'
        );
        panel.appendChild(dragDropContainer);

        // Confirm Moves toggle
        const confirmMovesContainer = this.createToggleSetting(
            'confirmMoves',
            'Confirm Moves',
            'Ask for confirmation before making a move'
        );
        panel.appendChild(confirmMovesContainer);

        // Theme selector
        const themeContainer = this.createSelectSetting(
            'theme',
            'Board Theme',
            'Choose the board appearance',
            {
                'classic': 'Classic',
                'wood': 'Wooden',
                'modern': 'Modern',
                'contrast': 'High Contrast'
            }
        );
        panel.appendChild(themeContainer);

        // Notation selector
        const notationContainer = this.createSelectSetting(
            'notation',
            'Move Notation',
            'Choose the move notation style',
            {
                'numeric': 'Numeric (1-50)',
                'algebraic': 'Algebraic (a1-e5)'
            }
        );
        panel.appendChild(notationContainer);

        // Reset button
        const resetButton = createElement('button', {
            class: 'settings-reset-button'
        }, {
            textContent: 'Reset to Defaults',
            onclick: () => this.resetToDefaults()
        });
        panel.appendChild(resetButton);

        return panel;
    }

    createToggleSetting(key, label, description) {
        const container = createElement('div', { class: 'settings-item' });

        const toggle = createElement('input', {
            type: 'checkbox'
        });
        toggle.checked = this.settings[key];
        toggle.onchange = () => this.set(key, toggle.checked);

        const title = createElement('span', { class: 'settings-title' }, { textContent: label });
        const desc = createElement('span', { class: 'settings-description' }, { textContent: description });

        const textContainer = createElement('div', { class: 'settings-text' });
        textContainer.appendChild(title);
        textContainer.appendChild(desc);

        const labelElement = createElement('label', { class: 'settings-label' });
        labelElement.appendChild(toggle);
        labelElement.appendChild(textContainer);

        container.appendChild(labelElement);

        return container;
    }

    createSelectSetting(key, label, description, options) {
        const container = createElement('div', { class: 'settings-item' });

        const title = createElement('span', { class: 'settings-title' }, { textContent: label });
        const desc = createElement('span', { class: 'settings-description' }, { textContent: description });

        const textContainer = createElement('div', { class: 'settings-text' });
        textContainer.appendChild(title);
        textContainer.appendChild(desc);

        const select = createElement('select', { class: 'settings-select' });
        select.value = this.settings[key];
        select.onchange = () => this.set(key, select.value);

        for (const [value, text] of Object.entries(options)) {
            const option = createElement('option', { value }, { textContent: text });
            select.appendChild(option);
        }

        container.appendChild(textContainer);
        container.appendChild(select);

        return container;
    }

    addListener(event, callback) {
        if (!this.callbacks.has(event)) {
            this.callbacks.set(event, new Set());
        }
        this.callbacks.get(event).add(callback);
    }

    removeListener(event, callback) {
        if (this.callbacks.has(event)) {
            this.callbacks.get(event).delete(callback);
        }
    }

    notifyListeners(event, data) {
        if (this.callbacks.has(event)) {
            for (const callback of this.callbacks.get(event)) {
                callback(data);
            }
        }
    }
}
