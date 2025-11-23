/**
 * Seeding Strategies for Tournament Brackets
 * Determines how participants are placed in the bracket
 */

/**
 * Random seeding - shuffles participants randomly
 * @param {Array<string>} participants - List of participant IDs
 * @returns {Array<string>} Shuffled participants
 */
export function randomSeeding(participants) {
  const shuffled = [...participants];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Manual seeding - uses provided seed order
 * @param {Array<{ participantId: string, seed: number }>} registrations - Registrations with seeds
 * @returns {Array<string>} Participants ordered by seed
 */
export function manualSeeding(registrations) {
  return registrations
    .filter(r => r.seed != null)
    .sort((a, b) => a.seed - b.seed)
    .map(r => r.participantId);
}

/**
 * Snake seeding - 1,4,5,8,9... pattern for balanced groups
 * @param {Array<string>} participants - Seeded list of participants
 * @param {number} groupCount - Number of groups
 * @returns {Array<Array<string>>} Participants distributed into groups
 */
export function snakeSeeding(participants, groupCount) {
  const groups = Array.from({ length: groupCount }, () => []);
  let direction = 1;
  let groupIndex = 0;

  for (const participant of participants) {
    groups[groupIndex].push(participant);

    groupIndex += direction;
    if (groupIndex >= groupCount) {
      direction = -1;
      groupIndex = groupCount - 1;
    } else if (groupIndex < 0) {
      direction = 1;
      groupIndex = 0;
    }
  }

  return groups;
}

/**
 * Standard bracket seeding - places seeds to avoid early matchups between top seeds
 * For power-of-2 brackets: 1v8, 4v5, 3v6, 2v7 pattern
 * @param {Array<string>} participants - Seeded list of participants
 * @param {number} bracketSize - Size of bracket (must be power of 2)
 * @returns {Array<string|null>} Participants in bracket order (null for byes)
 */
export function bracketSeeding(participants, bracketSize) {
  const result = new Array(bracketSize).fill(null);
  const positions = getBracketPositions(bracketSize);

  for (let i = 0; i < participants.length && i < bracketSize; i++) {
    result[positions[i]] = participants[i];
  }

  return result;
}

/**
 * Get bracket positions for standard seeding
 * @param {number} size - Bracket size
 * @returns {number[]} Array of positions
 */
function getBracketPositions(size) {
  if (size === 2) return [0, 1];
  if (size === 4) return [0, 3, 2, 1];
  if (size === 8) return [0, 7, 4, 3, 2, 5, 6, 1];
  if (size === 16) return [0, 15, 8, 7, 4, 11, 12, 3, 2, 13, 10, 5, 6, 9, 14, 1];
  if (size === 32) {
    return [0, 31, 16, 15, 8, 23, 24, 7, 4, 27, 20, 11, 12, 19, 28, 3,
            2, 29, 18, 13, 10, 21, 26, 5, 6, 25, 22, 9, 14, 17, 30, 1];
  }
  if (size === 64) {
    const base = getBracketPositions(32);
    const positions = [];
    for (const pos of base) {
      positions.push(pos * 2);
      positions.push(pos * 2 + 1);
    }
    return positions;
  }
  // For larger sizes, generate recursively
  return generateBracketPositions(size);
}

/**
 * Recursively generate bracket positions
 * @param {number} size - Bracket size
 * @returns {number[]}
 */
function generateBracketPositions(size) {
  if (size === 2) return [0, 1];

  const halfPositions = generateBracketPositions(size / 2);
  const positions = [];

  for (const pos of halfPositions) {
    positions.push(pos * 2);
    positions.push(pos * 2 + 1);
  }

  return positions;
}

/**
 * Calculate next power of 2 >= n
 * @param {number} n - Number
 * @returns {number}
 */
export function nextPowerOf2(n) {
  let power = 1;
  while (power < n) power *= 2;
  return power;
}

/**
 * Calculate number of byes needed
 * @param {number} participantCount - Number of participants
 * @returns {number}
 */
export function calculateByes(participantCount) {
  return nextPowerOf2(participantCount) - participantCount;
}

/**
 * Apply seeding strategy
 * @param {string} strategy - Strategy name ('random', 'manual', 'bracket')
 * @param {Array} participants - Participants or registrations
 * @param {Object} options - Strategy-specific options
 * @returns {Array<string>}
 */
export function applySeeding(strategy, participants, options = {}) {
  switch (strategy) {
    case 'random':
      return randomSeeding(participants);
    case 'manual':
      return manualSeeding(participants);
    case 'bracket':
      return bracketSeeding(participants, options.bracketSize || nextPowerOf2(participants.length));
    case 'snake':
      return snakeSeeding(participants, options.groupCount || 4).flat();
    default:
      return participants;
  }
}
