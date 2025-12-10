import { nextPowerOf2, calculateByes } from './seeding-strategies.js';
export function generateSingleEliminationBracket(participants, options = {}) {
    const { bestOf = 1, finalsBestOf = bestOf } = options;
    const bracketSize = nextPowerOf2(participants.length);
    const byes = calculateByes(participants.length);
    const rounds = Math.log2(bracketSize);
    const seededParticipants = fillWithByes(participants, bracketSize);
    const matches = [];
    for (let round = 1; round <= rounds; round++) {
        const roundMatches = [];
        const matchesInRound = bracketSize / Math.pow(2, round);
        for (let matchNum = 1; matchNum <= matchesInRound; matchNum++) {
            const match = {
                id: `R${round}M${matchNum}`,
                round,
                matchNumber: matchNum,
                participant1Id: null,
                participant2Id: null,
                winnerId: null,
                status: 'pending',
                bestOf: round === rounds ? finalsBestOf : bestOf,
                nextMatchId: round < rounds ? `R${round + 1}M${Math.ceil(matchNum / 2)}` : null
            };
            if (round === 1) {
                const idx1 = (matchNum - 1) * 2;
                const idx2 = idx1 + 1;
                match.participant1Id = seededParticipants[idx1] ?? null;
                match.participant2Id = seededParticipants[idx2] ?? null;
                if (match.participant1Id === null || match.participant2Id === null) {
                    match.winnerId = match.participant1Id || match.participant2Id;
                    match.status = 'bye';
                }
            }
            roundMatches.push(match);
        }
        matches.push(roundMatches);
    }
    processByeAdvancements(matches);
    return {
        rounds,
        matches,
        participants
    };
}
export function generateDoubleEliminationBracket(participants, options = {}) {
    const { bestOf = 1, grandFinalsBestOf = bestOf, grandFinalsReset = true } = options;
    const bracketSize = nextPowerOf2(participants.length);
    const winnersRounds = Math.log2(bracketSize);
    const losersRounds = (winnersRounds - 1) * 2;
    const seededParticipants = fillWithByes(participants, bracketSize);
    const winnersMatches = [];
    for (let round = 1; round <= winnersRounds; round++) {
        const roundMatches = [];
        const matchesInRound = bracketSize / Math.pow(2, round);
        for (let matchNum = 1; matchNum <= matchesInRound; matchNum++) {
            const loserRound = calculateLoserDropRound(round, winnersRounds);
            const match = {
                id: `WR${round}M${matchNum}`,
                round,
                matchNumber: matchNum,
                participant1Id: null,
                participant2Id: null,
                winnerId: null,
                status: 'pending',
                bestOf,
                nextMatchId: round < winnersRounds ? `WR${round + 1}M${Math.ceil(matchNum / 2)}` : 'GF',
                loserNextMatchId: loserRound ? `LR${loserRound}M${matchNum}` : null
            };
            if (round === 1) {
                const idx1 = (matchNum - 1) * 2;
                const idx2 = idx1 + 1;
                match.participant1Id = seededParticipants[idx1] ?? null;
                match.participant2Id = seededParticipants[idx2] ?? null;
                if (match.participant1Id === null || match.participant2Id === null) {
                    match.winnerId = match.participant1Id || match.participant2Id;
                    match.status = 'bye';
                }
            }
            roundMatches.push(match);
        }
        winnersMatches.push(roundMatches);
    }
    const losersMatches = [];
    for (let round = 1; round <= losersRounds; round++) {
        const matchesInRound = calculateLosersMatchCount(round, bracketSize);
        const roundMatches = [];
        for (let matchNum = 1; matchNum <= matchesInRound; matchNum++) {
            const match = {
                id: `LR${round}M${matchNum}`,
                round,
                matchNumber: matchNum,
                participant1Id: null,
                participant2Id: null,
                winnerId: null,
                status: 'pending',
                bestOf,
                nextMatchId: round < losersRounds ? `LR${round + 1}M${Math.ceil(matchNum / 2)}` : 'GF'
            };
            roundMatches.push(match);
        }
        losersMatches.push(roundMatches);
    }
    processByeAdvancements(winnersMatches);
    return {
        winnersRounds,
        losersRounds,
        winnersMatches,
        losersMatches,
        grandFinals: {
            participant1Id: null,
            participant2Id: null,
            winnerId: null,
            status: 'pending'
        },
        grandFinalsReset,
        participants
    };
}
export function generateRoundRobinSchedule(participants, options = {}) {
    const { rounds: numRounds = 1, bestOf = 1 } = options;
    const n = participants.length;
    const isOdd = n % 2 === 1;
    const effectiveParticipants = isOdd ? [...participants, null] : [...participants];
    const participantCount = effectiveParticipants.length;
    const roundsPerCycle = participantCount - 1;
    const schedule = [];
    let matchId = 1;
    for (let cycle = 0; cycle < numRounds; cycle++) {
        const rotation = [...effectiveParticipants];
        for (let round = 0; round < roundsPerCycle; round++) {
            const roundMatches = [];
            const actualRound = cycle * roundsPerCycle + round + 1;
            for (let i = 0; i < participantCount / 2; i++) {
                const home = rotation[i];
                const away = rotation[participantCount - 1 - i];
                if (home !== null && away !== null) {
                    const match = {
                        id: `M${matchId++}`,
                        round: actualRound,
                        matchNumber: roundMatches.length + 1,
                        participant1Id: (cycle % 2 === 0 ? home : away) ?? null,
                        participant2Id: (cycle % 2 === 0 ? away : home) ?? null,
                        winnerId: null,
                        status: 'pending',
                        bestOf
                    };
                    roundMatches.push(match);
                }
            }
            schedule.push({ round: actualRound, matches: roundMatches });
            const last = rotation.pop();
            rotation.splice(1, 0, last);
        }
    }
    return {
        rounds: roundsPerCycle * numRounds,
        schedule,
        participants
    };
}
export function generateSwissPairing(options) {
    const { participants, standings, completedPairings } = options;
    const sorted = [...standings].sort((a, b) => b.points - a.points);
    const paired = new Set();
    const pairings = [];
    const alreadyPlayed = new Set();
    for (const pairing of completedPairings) {
        alreadyPlayed.add(`${pairing.participant1Id}:${pairing.participant2Id}`);
        alreadyPlayed.add(`${pairing.participant2Id}:${pairing.participant1Id}`);
    }
    for (const standing of sorted) {
        if (paired.has(standing.participantId))
            continue;
        let opponent = null;
        for (const candidate of sorted) {
            if (candidate.participantId === standing.participantId)
                continue;
            if (paired.has(candidate.participantId))
                continue;
            const pairKey1 = `${standing.participantId}:${candidate.participantId}`;
            if (alreadyPlayed.has(pairKey1))
                continue;
            opponent = candidate.participantId;
            break;
        }
        if (opponent) {
            pairings.push({
                participant1Id: standing.participantId,
                participant2Id: opponent
            });
            paired.add(standing.participantId);
            paired.add(opponent);
        }
        else if (!paired.has(standing.participantId)) {
            pairings.push({
                participant1Id: standing.participantId,
                participant2Id: null
            });
            paired.add(standing.participantId);
        }
    }
    return pairings;
}
export function generateGSLBracket(options) {
    const { participants, bestOf = 1 } = options;
    if (participants.length !== 4) {
        throw new Error('GSL bracket requires exactly 4 participants');
    }
    const matches = [
        {
            id: 'GSL-M1',
            round: 1,
            matchNumber: 1,
            participant1Id: participants[0] ?? null,
            participant2Id: participants[1] ?? null,
            winnerId: null,
            status: 'pending',
            bestOf
        },
        {
            id: 'GSL-M2',
            round: 1,
            matchNumber: 2,
            participant1Id: participants[2] ?? null,
            participant2Id: participants[3] ?? null,
            winnerId: null,
            status: 'pending',
            bestOf
        },
        {
            id: 'GSL-WINNERS',
            round: 2,
            matchNumber: 1,
            participant1Id: null,
            participant2Id: null,
            winnerId: null,
            status: 'pending',
            bestOf
        },
        {
            id: 'GSL-LOSERS',
            round: 2,
            matchNumber: 2,
            participant1Id: null,
            participant2Id: null,
            winnerId: null,
            status: 'pending',
            bestOf
        },
        {
            id: 'GSL-DECIDER',
            round: 3,
            matchNumber: 1,
            participant1Id: null,
            participant2Id: null,
            winnerId: null,
            status: 'pending',
            bestOf
        }
    ];
    return {
        id: 'gsl-group',
        name: 'GSL Group',
        participants,
        matches,
        standings: []
    };
}
function fillWithByes(participants, size) {
    const result = new Array(size).fill(null);
    for (let i = 0; i < participants.length; i++) {
        result[i] = participants[i] ?? null;
    }
    return result;
}
function processByeAdvancements(matches) {
    for (let roundIdx = 0; roundIdx < matches.length - 1; roundIdx++) {
        for (const match of matches[roundIdx]) {
            if (match.status === 'bye' && match.winnerId && match.nextMatchId) {
                const [, roundStr, matchStr] = match.nextMatchId.match(/[WL]?R(\d+)M(\d+)/) || [];
                if (roundStr && matchStr) {
                    const nextRoundIdx = parseInt(roundStr) - 1;
                    const nextMatchIdx = parseInt(matchStr) - 1;
                    if (matches[nextRoundIdx] && matches[nextRoundIdx][nextMatchIdx]) {
                        const nextMatch = matches[nextRoundIdx][nextMatchIdx];
                        if (!nextMatch.participant1Id) {
                            nextMatch.participant1Id = match.winnerId;
                        }
                        else if (!nextMatch.participant2Id) {
                            nextMatch.participant2Id = match.winnerId;
                        }
                    }
                }
            }
        }
    }
}
function calculateLoserDropRound(winnersRound, totalWinnersRounds) {
    if (winnersRound === totalWinnersRounds)
        return null;
    return (winnersRound - 1) * 2 + 1;
}
function calculateLosersMatchCount(round, bracketSize) {
    const isDropRound = round % 2 === 1;
    const effectiveRound = Math.ceil(round / 2);
    if (isDropRound) {
        return bracketSize / Math.pow(2, effectiveRound + 1);
    }
    else {
        return bracketSize / Math.pow(2, effectiveRound + 1);
    }
}
//# sourceMappingURL=bracket-generator.js.map