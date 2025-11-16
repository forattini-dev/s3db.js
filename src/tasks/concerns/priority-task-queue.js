/**
 * Priority queue backed by a binary heap with optional latency aging.
 * Designed to keep compare operations hot by caching timestamps per drain.
 */
export class PriorityTaskQueue {
  constructor (options = {}) {
    this.heap = []
    this.counter = 0
    this.agingMs = options.agingMs ?? 0
    this.maxAgingBoost = options.maxAgingBoost ?? 0
    this.agingMultiplier = 1
    this._agingEnabled = this.agingMs > 0 && this.maxAgingBoost > 0
  }

  get length () {
    return this.heap.length
  }

  enqueue (task) {
    const node = {
      task,
      priority: task.priority || 0,
      order: this.counter++
    }
    if (this._agingEnabled) {
      node.enqueuedAt = Date.now()
    }
    this.heap.push(node)
    this._bubbleUp(this.heap.length - 1)
  }

  dequeue () {
    if (this.heap.length === 0) {
      return null
    }
    const topNode = this.heap[0]
    const lastNode = this.heap.pop()
    if (this.heap.length > 0 && lastNode) {
      this.heap[0] = lastNode
      this._bubbleDown(0)
    }
    return topNode.task
  }

  flush (callback) {
    if (typeof callback === 'function') {
      for (const node of this.heap) {
        callback(node.task)
      }
    }
    this.clear()
  }

  clear () {
    this.heap.length = 0
  }

  setAgingMultiplier (multiplier) {
    if (!this._agingEnabled) {
      return
    }
    if (typeof multiplier !== 'number' || Number.isNaN(multiplier)) {
      return
    }
    this.agingMultiplier = Math.min(4, Math.max(0.25, multiplier))
  }

  _bubbleUp (index) {
    const now = this._agingTimestamp()
    const agingBase = this._agingBase()
    while (index > 0) {
      const parentIndex = (index - 1) >> 1
      if (this._isHigherPriority(parentIndex, index, now, agingBase)) {
        break
      }
      this._swap(index, parentIndex)
      index = parentIndex
    }
  }

  _bubbleDown (index) {
    const length = this.heap.length
    if (length === 0) {
      return
    }
    const now = this._agingTimestamp()
    const agingBase = this._agingBase()
    while (true) {
      const left = (index << 1) + 1
      const right = left + 1
      let largest = index

      if (left < length && this._isHigherPriority(left, largest, now, agingBase)) {
        largest = left
      }

      if (right < length && this._isHigherPriority(right, largest, now, agingBase)) {
        largest = right
      }

      if (largest === index) {
        break
      }

      this._swap(index, largest)
      index = largest
    }
  }

  _isHigherPriority (indexA, indexB, now, agingBase) {
    const heap = this.heap
    const nodeA = heap[indexA]
    const nodeB = heap[indexB]
    if (!nodeB) return true
    const priorityA = this._priorityValue(nodeA, now, agingBase)
    const priorityB = this._priorityValue(nodeB, now, agingBase)
    if (priorityA === priorityB) {
      return nodeA.order < nodeB.order
    }
    return priorityA > priorityB
  }

  _priorityValue (node, now, agingBase) {
    if (!this._agingEnabled || !agingBase) {
      return node.priority
    }
    const waited = Math.max(0, now - (node.enqueuedAt || 0))
    if (waited <= 0) {
      return node.priority
    }
    const bonus = Math.min(this.maxAgingBoost, waited / agingBase)
    return node.priority + bonus
  }

  _swap (i, j) {
    const tmp = this.heap[i]
    this.heap[i] = this.heap[j]
    this.heap[j] = tmp
  }

  _agingTimestamp () {
    return this._agingEnabled ? Date.now() : 0
  }

  _agingBase () {
    if (!this._agingEnabled) {
      return 0
    }
    const base = this.agingMs * this.agingMultiplier
    if (!base || !Number.isFinite(base)) {
      return 0
    }
    return base
  }
}
