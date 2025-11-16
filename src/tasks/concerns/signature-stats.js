export class SignatureStats {
  constructor (options = {}) {
    this.alpha = typeof options.alpha === 'number' ? options.alpha : 0.2
    this.maxEntries = Math.max(1, options.maxEntries ?? 256)
    this.entries = new Map()
  }

  record (signature, metrics = {}) {
    if (!signature) {
      return
    }
    const entry = this.entries.get(signature) || {
      signature,
      count: 0,
      avgQueueWait: 0,
      avgExecution: 0,
      successRate: 1
    }
    entry.count++
    entry.avgQueueWait = this._mix(entry.avgQueueWait, metrics.queueWait ?? 0)
    entry.avgExecution = this._mix(entry.avgExecution, metrics.execution ?? 0)
    entry.successRate = this._mix(entry.successRate, metrics.success === false ? 0 : 1)
    this.entries.set(signature, entry)

    if (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value
      if (oldestKey) {
        this.entries.delete(oldestKey)
      }
    }
  }

  snapshot (limit = 10) {
    if (this.entries.size === 0) {
      return []
    }
    const sorted = Array.from(this.entries.values()).sort((a, b) => {
      if (a.avgExecution === b.avgExecution) {
        return b.count - a.count
      }
      return b.avgExecution - a.avgExecution
    })
    return sorted.slice(0, limit).map((entry) => ({
      signature: entry.signature,
      count: entry.count,
      avgQueueWait: Number(entry.avgQueueWait.toFixed(2)),
      avgExecution: Number(entry.avgExecution.toFixed(2)),
      successRate: Number(entry.successRate.toFixed(2))
    }))
  }

  reset () {
    this.entries.clear()
  }

  _mix (current, incoming) {
    if (current === 0) return incoming
    return current * (1 - this.alpha) + incoming * this.alpha
  }
}
