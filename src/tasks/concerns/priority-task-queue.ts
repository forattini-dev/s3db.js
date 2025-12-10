export interface PriorityTaskQueueOptions {
  agingMs?: number;
  maxAgingBoost?: number;
}

export interface PriorityNode<T = unknown> {
  task: T;
  priority: number;
  order: number;
  enqueuedAt?: number;
}

export interface TaskWithPriority {
  priority?: number;
}

export class PriorityTaskQueue<T extends TaskWithPriority = TaskWithPriority> {
  public heap: PriorityNode<T>[];
  public counter: number;
  public agingMs: number;
  public maxAgingBoost: number;
  public agingMultiplier: number;
  private _agingEnabled: boolean;

  constructor(options: PriorityTaskQueueOptions = {}) {
    this.heap = [];
    this.counter = 0;
    this.agingMs = options.agingMs ?? 0;
    this.maxAgingBoost = options.maxAgingBoost ?? 0;
    this.agingMultiplier = 1;
    this._agingEnabled = this.agingMs > 0 && this.maxAgingBoost > 0;
  }

  get length(): number {
    return this.heap.length;
  }

  enqueue(task: T): void {
    const node: PriorityNode<T> = {
      task,
      priority: task.priority || 0,
      order: this.counter++
    };
    if (this._agingEnabled) {
      node.enqueuedAt = Date.now();
    }
    this.heap.push(node);
    this._bubbleUp(this.heap.length - 1);
  }

  dequeue(): T | null {
    if (this.heap.length === 0) {
      return null;
    }
    const topNode = this.heap[0]!;
    const lastNode = this.heap.pop();
    if (this.heap.length > 0 && lastNode) {
      this.heap[0] = lastNode;
      this._bubbleDown(0);
    }
    return topNode.task;
  }

  flush(callback?: (task: T) => void): void {
    if (typeof callback === 'function') {
      for (const node of this.heap) {
        callback(node.task);
      }
    }
    this.clear();
  }

  clear(): void {
    this.heap.length = 0;
  }

  setAgingMultiplier(multiplier: number): void {
    if (!this._agingEnabled) {
      return;
    }
    if (typeof multiplier !== 'number' || Number.isNaN(multiplier)) {
      return;
    }
    this.agingMultiplier = Math.min(4, Math.max(0.25, multiplier));
  }

  private _bubbleUp(index: number): void {
    const now = this._agingTimestamp();
    const agingBase = this._agingBase();
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      if (this._isHigherPriority(parentIndex, index, now, agingBase)) {
        break;
      }
      this._swap(index, parentIndex);
      index = parentIndex;
    }
  }

  private _bubbleDown(index: number): void {
    const length = this.heap.length;
    if (length === 0) {
      return;
    }
    const now = this._agingTimestamp();
    const agingBase = this._agingBase();
    while (true) {
      const left = (index << 1) + 1;
      const right = left + 1;
      let largest = index;

      if (left < length && this._isHigherPriority(left, largest, now, agingBase)) {
        largest = left;
      }

      if (right < length && this._isHigherPriority(right, largest, now, agingBase)) {
        largest = right;
      }

      if (largest === index) {
        break;
      }

      this._swap(index, largest);
      index = largest;
    }
  }

  private _isHigherPriority(indexA: number, indexB: number, now: number, agingBase: number): boolean {
    const heap = this.heap;
    const nodeA = heap[indexA];
    const nodeB = heap[indexB];
    if (!nodeA) return false;
    if (!nodeB) return true;
    const priorityA = this._priorityValue(nodeA, now, agingBase);
    const priorityB = this._priorityValue(nodeB, now, agingBase);
    if (priorityA === priorityB) {
      return nodeA.order < nodeB.order;
    }
    return priorityA > priorityB;
  }

  private _priorityValue(node: PriorityNode<T>, now: number, agingBase: number): number {
    if (!this._agingEnabled || !agingBase) {
      return node.priority;
    }
    const waited = Math.max(0, now - (node.enqueuedAt || 0));
    if (waited <= 0) {
      return node.priority;
    }
    const bonus = Math.min(this.maxAgingBoost, waited / agingBase);
    return node.priority + bonus;
  }

  private _swap(i: number, j: number): void {
    const tmp = this.heap[i]!;
    this.heap[i] = this.heap[j]!;
    this.heap[j] = tmp;
  }

  private _agingTimestamp(): number {
    return this._agingEnabled ? Date.now() : 0;
  }

  private _agingBase(): number {
    if (!this._agingEnabled) {
      return 0;
    }
    const base = this.agingMs * this.agingMultiplier;
    if (!base || !Number.isFinite(base)) {
      return 0;
    }
    return base;
  }
}
