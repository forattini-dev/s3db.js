/**
 * State Machine Base Class
 *
 * Provides state transition validation and execution for workflows.
 *
 * @abstract
 */
class StateMachine {
  constructor(states, transitions) {
    this.STATES = states;
    this.TRANSITIONS = transitions;
  }

  /**
   * Validate if a transition is allowed from current state
   *
   * @param {string} currentState - Current state
   * @param {string} transitionName - Transition to execute
   * @returns {Object} { valid: boolean, newState?: string, error?: string }
   */
  canTransition(currentState, transitionName) {
    const transition = this.TRANSITIONS[transitionName];

    if (!transition) {
      return {
        valid: false,
        error: `Unknown transition: ${transitionName}. Valid transitions: ${Object.keys(this.TRANSITIONS).join(', ')}`
      };
    }

    // Support multiple "from" states
    const validFromStates = Array.isArray(transition.from) ? transition.from : [transition.from];

    if (!validFromStates.includes(currentState)) {
      return {
        valid: false,
        error: `Cannot transition from "${currentState}" to "${transition.to}" via "${transitionName}". Expected current state to be one of: ${validFromStates.join(', ')}`
      };
    }

    return { valid: true, newState: transition.to };
  }

  /**
   * Execute a state transition with validation
   *
   * @param {Object} record - Record to transition (must have status field)
   * @param {string} transitionName - Transition to execute
   * @param {Object} resource - S3DB resource to update
   * @param {Object} metadata - Additional fields to update
   * @returns {Promise<Object>} Updated record
   * @throws {Error} If transition is invalid or update fails
   */
  async transition(record, transitionName, resource, metadata = {}) {
    const validation = this.canTransition(record.status, transitionName);

    if (!validation.valid) {
      throw new Error(`State machine error: ${validation.error}`);
    }

    // Prepare update payload
    const updateData = {
      status: validation.newState,
      ...metadata,
      lastTransitionAt: new Date().toISOString(),
      lastTransition: transitionName
    };

    // Update record
    const updated = await resource.patch(record.id, updateData);

    return updated;
  }

  /**
   * Get all valid transitions from current state
   *
   * @param {string} currentState - Current state
   * @returns {Array<string>} List of valid transition names
   */
  getValidTransitions(currentState) {
    return Object.entries(this.TRANSITIONS)
      .filter(([_, transition]) => {
        const validFromStates = Array.isArray(transition.from) ? transition.from : [transition.from];
        return validFromStates.includes(currentState);
      })
      .map(([name]) => name);
  }

  /**
   * Check if state is terminal (no outgoing transitions)
   *
   * @param {string} state - State to check
   * @returns {boolean}
   */
  isTerminalState(state) {
    return this.getValidTransitions(state).length === 0;
  }
}

/**
 * Notification State Machine
 *
 * Manages notification lifecycle: pending → processing → completed/failed
 *
 * States:
 * - pending: Waiting to be processed
 * - processing: Currently being sent
 * - completed: Successfully delivered
 * - failed: Failed after max retries
 *
 * Transitions:
 * - START_PROCESSING: pending → processing
 * - COMPLETE: processing → completed
 * - FAIL: processing → failed
 * - RETRY: processing → pending (for retry)
 *
 * @example
 * const notificationSM = new NotificationStateMachine();
 *
 * // Start processing
 * await notificationSM.transition(
 *   notification,
 *   'START_PROCESSING',
 *   notificationsResource,
 *   { processingStartedAt: new Date().toISOString() }
 * );
 *
 * // Complete
 * await notificationSM.transition(
 *   notification,
 *   'COMPLETE',
 *   notificationsResource,
 *   { completedAt: new Date().toISOString(), lastStatusCode: 200 }
 * );
 */
export class NotificationStateMachine extends StateMachine {
  constructor() {
    const STATES = {
      PENDING: 'pending',
      PROCESSING: 'processing',
      COMPLETED: 'completed',
      FAILED: 'failed'
    };

    const TRANSITIONS = {
      START_PROCESSING: { from: 'pending', to: 'processing' },
      COMPLETE: { from: 'processing', to: 'completed' },
      FAIL: { from: 'processing', to: 'failed' },
      RETRY: { from: 'processing', to: 'pending' }
    };

    super(STATES, TRANSITIONS);
  }
}

/**
 * Attempt State Machine
 *
 * Manages individual attempt lifecycle: queued → running → success/failed/timeout
 *
 * States:
 * - queued: Waiting to be executed
 * - running: Currently executing
 * - success: Completed successfully
 * - failed: Failed (may retry)
 * - timeout: Timed out (may retry)
 *
 * Transitions:
 * - START: queued → running
 * - SUCCEED: running → success
 * - FAIL: running → failed
 * - TIMEOUT: running → timeout
 *
 * @example
 * const attemptSM = new AttemptStateMachine();
 *
 * // Create attempt
 * const attempt = await attemptSM.create(attemptsResource, {
 *   notificationId: notification.id,
 *   attemptNumber: 1,
 *   channel: 'webhook',
 *   data: { url: 'https://...' }
 * });
 *
 * // Start execution
 * await attemptSM.transition(attempt, 'START', attemptsResource, {
 *   startedAt: new Date().toISOString()
 * });
 *
 * // Complete with success
 * await attemptSM.transition(attempt, 'SUCCEED', attemptsResource, {
 *   statusCode: 200,
 *   response: { success: true },
 *   completedAt: new Date().toISOString()
 * });
 */
export class AttemptStateMachine extends StateMachine {
  constructor() {
    const STATES = {
      QUEUED: 'queued',
      RUNNING: 'running',
      SUCCESS: 'success',
      FAILED: 'failed',
      TIMEOUT: 'timeout'
    };

    const TRANSITIONS = {
      START: { from: 'queued', to: 'running' },
      SUCCEED: { from: 'running', to: 'success' },
      FAIL: { from: 'running', to: 'failed' },
      TIMEOUT: { from: 'running', to: 'timeout' }
    };

    super(STATES, TRANSITIONS);
  }

  /**
   * Create a new attempt with initial state
   *
   * Note: Uses insert() instead of patch() for attempts table
   *
   * @param {Object} resource - S3DB attempts resource
   * @param {Object} data - Attempt data
   * @returns {Promise<Object>} Created attempt
   */
  async create(resource, data) {
    return await resource.insert({
      ...data,
      status: this.STATES.QUEUED,
      createdAt: new Date().toISOString()
    });
  }

  /**
   * Execute transition for attempt
   *
   * Note: Uses insert() instead of patch() since attempts are immutable
   *
   * @param {Object} record - Attempt record
   * @param {string} transitionName - Transition to execute
   * @param {Object} resource - S3DB resource
   * @param {Object} metadata - Additional fields
   * @returns {Promise<Object>} New attempt record
   */
  async transition(record, transitionName, resource, metadata = {}) {
    const validation = this.canTransition(record.status, transitionName);

    if (!validation.valid) {
      throw new Error(`State machine error: ${validation.error}`);
    }

    // For attempts, we insert a new record (immutable pattern)
    const newRecord = await resource.insert({
      ...record,
      status: validation.newState,
      ...metadata,
      lastTransitionAt: new Date().toISOString(),
      lastTransition: transitionName
    });

    return newRecord;
  }
}

/**
 * Factory function to create state machines
 *
 * @example
 * import { createNotificationStateMachine, createAttemptStateMachine } from './state-machine.js';
 *
 * const notificationSM = createNotificationStateMachine();
 * const attemptSM = createAttemptStateMachine();
 */
export function createNotificationStateMachine() {
  return new NotificationStateMachine();
}

export function createAttemptStateMachine() {
  return new AttemptStateMachine();
}

export default {
  NotificationStateMachine,
  AttemptStateMachine,
  createNotificationStateMachine,
  createAttemptStateMachine
};
