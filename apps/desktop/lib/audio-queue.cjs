'use strict';
const { fault } = require('./errors.cjs');
class AudioQueue {
  constructor(capacity = 2) { this.capacity = capacity; this.items = []; this.waiters = []; this.closed = false; }
  wake() { for (const resolve of this.waiters.splice(0)) resolve(); }
  async push(value) {
    while (this.items.length >= this.capacity && !this.closed) await new Promise(resolve => this.waiters.push(resolve));
    if (this.error) throw this.error; if (this.closed) throw fault('CANCELLED');
    this.items.push(value); this.wake();
  }
  async next() {
    while (!this.items.length && !this.closed) await new Promise(resolve => this.waiters.push(resolve));
    if (this.error) throw this.error;
    const value = this.items.shift(); this.wake(); return value;
  }
  finish() { this.closed = true; this.wake(); }
  cancel(error = fault('CANCELLED')) { this.error = error; this.items = []; this.finish(); }
}
module.exports = { AudioQueue };
