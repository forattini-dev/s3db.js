export interface SeedingOptions {
  preserveSeeds?: boolean;
}

export function randomSeeding(participants: string[]): string[] {
  const shuffled = [...participants];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

export function manualSeeding(participants: string[], seeds: string[]): string[] {
  const result: string[] = [];
  const remaining = new Set(participants);

  for (const seed of seeds) {
    if (remaining.has(seed)) {
      result.push(seed);
      remaining.delete(seed);
    }
  }

  for (const participant of remaining) {
    result.push(participant);
  }

  return result;
}

export function snakeSeeding(participants: string[], groupCount: number): string[][] {
  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  let direction = 1;
  let groupIndex = 0;

  for (const participant of participants) {
    groups[groupIndex]!.push(participant);

    groupIndex += direction;

    if (groupIndex >= groupCount) {
      groupIndex = groupCount - 1;
      direction = -1;
    } else if (groupIndex < 0) {
      groupIndex = 0;
      direction = 1;
    }
  }

  return groups;
}

export function bracketSeeding(participants: string[]): string[] {
  const size = nextPowerOf2(participants.length);
  const seeded: (string | null)[] = new Array(size).fill(null);

  seeded[0] = participants[0] || null;
  if (participants.length > 1) seeded[size - 1] = participants[1] || null;

  if (participants.length > 2) {
    const mid = size / 2;
    seeded[mid] = participants[2] || null;
    if (participants.length > 3) seeded[mid - 1] = participants[3] || null;
  }

  let placed = Math.min(4, participants.length);
  const positions = generateBracketPositions(size);

  for (let i = placed; i < participants.length && i < positions.length; i++) {
    seeded[positions[i]!] = participants[i]!;
  }

  return seeded.filter((p): p is string => p !== null);
}

function generateBracketPositions(size: number): number[] {
  const positions: number[] = [0, size - 1];

  if (size >= 4) {
    positions.push(size / 2, size / 2 - 1);
  }

  let step = size / 4;
  while (step >= 1) {
    const newPositions: number[] = [];
    for (let i = step; i < size; i += step * 2) {
      if (!positions.includes(i)) newPositions.push(i);
      if (!positions.includes(size - 1 - i)) newPositions.push(size - 1 - i);
    }
    positions.push(...newPositions);
    step = step / 2;
  }

  return positions;
}

export function nextPowerOf2(n: number): number {
  let power = 1;
  while (power < n) {
    power *= 2;
  }
  return power;
}

export function calculateByes(participantCount: number): number {
  const bracketSize = nextPowerOf2(participantCount);
  return bracketSize - participantCount;
}

export function applySeeding(
  participants: string[],
  strategy: 'random' | 'manual' | 'snake' | 'bracket',
  options: SeedingOptions & { seeds?: string[]; groupCount?: number } = {}
): string[] | string[][] {
  switch (strategy) {
    case 'random':
      return randomSeeding(participants);
    case 'manual':
      return manualSeeding(participants, options.seeds || []);
    case 'snake':
      return snakeSeeding(participants, options.groupCount || 4);
    case 'bracket':
      return bracketSeeding(participants);
    default:
      return participants;
  }
}
