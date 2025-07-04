export class Notification {
    constructor() {
        this.container = document.createElement('div');
        this.container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; max-width: 350px;';
        document.body.appendChild(this.container);
        this.currentNotification = null;
    }
    show(message, options = {}) {
        const { type = 'info', duration = 3000, closable = true } = options;
        if (this.currentNotification) this.closeCurrent();
        const notification = document.createElement('div');
        notification.textContent = message;
        let borderColor = '#3498db'; // info
        if (type === 'success') borderColor = '#2ecc71';
        if (type === 'warning') borderColor = '#f1c40f';
        if (type === 'error') borderColor = '#e74c3c';
        notification.style.cssText = `background-color: white; padding: 12px 16px; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border-left: 4px solid ${borderColor}; transition: all 0.3s ease; transform: translateX(100%); opacity: 0;`;
        this.container.appendChild(notification);
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
            notification.style.opacity = '1';
        }, 10);
        this.currentNotification = notification;
        if (duration > 0) {
            setTimeout(() => this.close(notification), duration);
        }
    }
    close(notification) {
        if (!notification || !notification.parentNode) return;
        notification.style.transform = 'translateX(100%)';
        notification.style.opacity = '0';
        notification.addEventListener('transitionend', () => notification.remove(), { once: true });
        if (this.currentNotification === notification) this.currentNotification = null;
    }
    closeCurrent() { this.close(this.currentNotification); }
    success(msg, opts) { this.show(msg, { ...opts, type: 'success' }); }
    warning(msg, opts) { this.show(msg, { ...opts, type: 'warning' }); }
    error(msg, opts) { this.show(msg, { ...opts, type: 'error' }); }
    info(msg, opts) { this.show(msg, { ...opts, type: 'info' }); }
}