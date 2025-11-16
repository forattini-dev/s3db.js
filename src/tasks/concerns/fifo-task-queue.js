/**
 * High-throughput FIFO queue built on a power-of-two ring buffer.
 * Eliminates Array.shift() copies and uses bit masks to wrap indices.
 */
export class FifoTaskQueue {
  constructor (capacity = 32) {
    const size = this._normalizeCapacity(capacity)
    this.buffer = new Array(size)
    this.mask = size - 1
    this.head = 0
    this.tail = 0
  }

  get length () {
    return this.tail - this.head
  }

  enqueue (value) {
    if (this.length >= this.buffer.length) {
      this._grow()
    }
    const index = this.tail & this.mask
    this.buffer[index] = value
    this.tail++
  }

  dequeue () {
    if (this.head === this.tail) {
      return null
    }
    const index = this.head & this.mask
    const value = this.buffer[index]
    this.buffer[index] = undefined
    this.head++
    if (this.head === this.tail) {
      this.head = 0
      this.tail = 0
    }
    return value
  }

  flush (callback) {
    if (typeof callback === 'function') {
      for (let i = this.head; i < this.tail; i++) {
        const value = this.buffer[i & this.mask]
        if (value !== undefined) {
          callback(value)
        }
      }
    }
    this.clear()
  }

  clear () {
    if (this.head !== this.tail) {
      for (let i = this.head; i < this.tail; i++) {
        this.buffer[i & this.mask] = undefined
      }
    }
    this.head = 0
    this.tail = 0
  }

  setAgingMultiplier () {
    // Compatibility no-op for TasksPool.
  }

  toArray () {
    const len = this.length
    if (len === 0) {
      return []
    }
    const snapshot = new Array(len)
    for (let i = 0; i < len; i++) {
      snapshot[i] = this.buffer[(this.head + i) & this.mask]
    }
    return snapshot
  }

  _grow () {
    const newSize = this.buffer.length * 2
    const next = new Array(newSize)
    const len = this.length
    for (let i = 0; i < len; i++) {
      next[i] = this.buffer[(this.head + i) & this.mask]
    }
    this.buffer = next
    this.mask = newSize - 1
    this.head = 0
    this.tail = len
  }

  _normalizeCapacity (value) {
    let size = 8
    const normalized = Number.isFinite(value) && value > 0 ? Math.ceil(value) : size
    const target = Math.max(size, normalized)
    while (size < target) {
      size <<= 1
    }
    return size
  }
}
