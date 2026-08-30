class EventEmitter {
  private listeners: { [event: string]: Function[] } = {};

  on(event: string, listener: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
    return this;
  }

  off(event: string, listener: Function) {
    if (!this.listeners[event]) return this;
    this.listeners[event] = this.listeners[event].filter(l => l !== listener);
    return this;
  }

  emit(event: string, ...args: any[]) {
    if (!this.listeners[event]) return false;
    this.listeners[event].forEach(listener => listener(...args));
    return true;
  }
}

export const appEvents = new EventEmitter();
export const FOOD_LOGGED_EVENT = 'food_logged';
export const PROFILE_UPDATED_EVENT = 'profile_updated';
export const FUTURE_YOU_UPDATED_EVENT = 'future_you_updated';
