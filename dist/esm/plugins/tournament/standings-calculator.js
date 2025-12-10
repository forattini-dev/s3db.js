export function calculateRoundRobinStandings(matches, config = {}) {
    const { pointsWin = 3, pointsDraw = 1, pointsLoss = 0 } = config;
    const stats = new Map();
    for (const match of matches) {
        if (match.status !== 'completed')
            continue;
        const p1 = match.participant1Id;
        const p2 = match.participant2Id;
        if (!p1 || !p2)
            continue;
        if (!stats.has(p1)) {
            stats.set(p1, createStanding(p1));
        }
        if (!stats.has(p2)) {
            stats.set(p2, createStanding(p2));
        }
        const s1 = stats.get(p1);
        const s2 = stats.get(p2);
        s1.played = (s1.played || 0) + 1;
        s2.played = (s2.played || 0) + 1;
        s1.goalsFor = (s1.goalsFor || 0) + match.score1;
        s1.goalsAgainst = (s1.goalsAgainst || 0) + match.score2;
        s2.goalsFor = (s2.goalsFor || 0) + match.score2;
        s2.goalsAgainst = (s2.goalsAgainst || 0) + match.score1;
        if (match.winnerId === p1) {
            s1.wins = (s1.wins || 0) + 1;
            s1.points = (s1.points || 0) + pointsWin;
            s2.losses = (s2.losses || 0) + 1;
            s2.points = (s2.points || 0) + pointsLoss;
        }
        else if (match.winnerId === p2) {
            s2.wins = (s2.wins || 0) + 1;
            s2.points = (s2.points || 0) + pointsWin;
            s1.losses = (s1.losses || 0) + 1;
            s1.points = (s1.points || 0) + pointsLoss;
        }
        else {
            s1.draws = (s1.draws || 0) + 1;
            s1.points = (s1.points || 0) + pointsDraw;
            s2.draws = (s2.draws || 0) + 1;
            s2.points = (s2.points || 0) + pointsDraw;
        }
        s1.goalDifference = (s1.goalsFor || 0) - (s1.goalsAgainst || 0);
        s2.goalDifference = (s2.goalsFor || 0) - (s2.goalsAgainst || 0);
    }
    return sortStandings(Array.from(stats.values()));
}
export function calculateEliminationStandings(matches, bracket) {
    const standings = [];
    const processed = new Set();
    const sortedMatches = [...matches]
        .filter(m => m.status === 'completed')
        .sort((a, b) => b.round - a.round);
    for (const match of sortedMatches) {
        if (match.winnerId && !processed.has(match.winnerId)) {
            standings.push({
                participantId: match.winnerId,
                placement: standings.length + 1,
                wins: countWins(matches, match.winnerId),
                losses: countLosses(matches, match.winnerId),
                eliminatedPhase: null
            });
            processed.add(match.winnerId);
        }
        if (match.loserId && !processed.has(match.loserId)) {
            standings.push({
                participantId: match.loserId,
                placement: standings.length + 1,
                wins: countWins(matches, match.loserId),
                losses: countLosses(matches, match.loserId),
                eliminatedPhase: match.phase,
                eliminatedRound: match.round
            });
            processed.add(match.loserId);
        }
    }
    const allParticipants = bracket.participants || [];
    for (const p of allParticipants) {
        if (!processed.has(p)) {
            standings.push({
                participantId: p,
                placement: standings.length + 1,
                wins: 0,
                losses: 0,
                eliminatedPhase: null
            });
        }
    }
    return standings;
}
export function calculateSwissStandings(matches, participants) {
    const stats = new Map();
    for (const p of participants) {
        stats.set(p, createStanding(p));
    }
    for (const match of matches) {
        if (match.status !== 'completed')
            continue;
        const p1 = match.participant1Id;
        const p2 = match.participant2Id;
        if (!p1 || !p2)
            continue;
        const s1 = stats.get(p1);
        const s2 = stats.get(p2);
        s1.played = (s1.played || 0) + 1;
        s2.played = (s2.played || 0) + 1;
        if (match.winnerId === p1) {
            s1.wins = (s1.wins || 0) + 1;
            s1.points = (s1.points || 0) + 1;
            s2.losses = (s2.losses || 0) + 1;
        }
        else if (match.winnerId === p2) {
            s2.wins = (s2.wins || 0) + 1;
            s2.points = (s2.points || 0) + 1;
            s1.losses = (s1.losses || 0) + 1;
        }
        else {
            s1.draws = (s1.draws || 0) + 1;
            s1.points = (s1.points || 0) + 0.5;
            s2.draws = (s2.draws || 0) + 1;
            s2.points = (s2.points || 0) + 0.5;
        }
    }
    calculateBuchholz(stats, matches);
    return sortSwissStandings(Array.from(stats.values()));
}
function calculateBuchholz(stats, matches) {
    const opponents = new Map();
    for (const match of matches) {
        if (match.status !== 'completed')
            continue;
        const p1 = match.participant1Id;
        const p2 = match.participant2Id;
        if (!p1 || !p2)
            continue;
        if (!opponents.has(p1))
            opponents.set(p1, []);
        if (!opponents.has(p2))
            opponents.set(p2, []);
        opponents.get(p1).push(p2);
        opponents.get(p2).push(p1);
    }
    for (const [participantId, opponentList] of opponents) {
        const standing = stats.get(participantId);
        if (!standing)
            continue;
        standing.buchholz = opponentList.reduce((sum, opponentId) => {
            const opponentStanding = stats.get(opponentId);
            return sum + (opponentStanding?.points || 0);
        }, 0);
    }
}
function sortSwissStandings(standings) {
    return standings.sort((a, b) => {
        if ((b.points ?? 0) !== (a.points ?? 0))
            return (b.points ?? 0) - (a.points ?? 0);
        if ((b.buchholz ?? 0) !== (a.buchholz ?? 0))
            return (b.buchholz ?? 0) - (a.buchholz ?? 0);
        if ((b.wins ?? 0) !== (a.wins ?? 0))
            return (b.wins ?? 0) - (a.wins ?? 0);
        return 0;
    });
}
export function calculateLadderRankings(rankings) {
    return rankings
        .sort((a, b) => a.rank - b.rank)
        .map(r => ({
        participantId: r.participantId,
        rank: r.rank,
        rating: r.rating,
        wins: r.wins,
        losses: r.losses,
        streak: r.streak
    }));
}
export function calculateCircuitStandings(events) {
    const totals = new Map();
    for (const event of events) {
        if (!event.results)
            continue;
        for (const result of event.results) {
            const current = totals.get(result.participantId) || 0;
            totals.set(result.participantId, current + result.points);
        }
    }
    return Array.from(totals.entries())
        .map(([participantId, points]) => ({ participantId, points }))
        .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
        .map((s, idx) => ({ ...s, rank: idx + 1 }));
}
export function sortStandings(standings) {
    return standings.sort((a, b) => {
        if ((b.points ?? 0) !== (a.points ?? 0))
            return (b.points ?? 0) - (a.points ?? 0);
        if ((b.goalDifference ?? 0) !== (a.goalDifference ?? 0))
            return (b.goalDifference ?? 0) - (a.goalDifference ?? 0);
        if ((b.goalsFor ?? 0) !== (a.goalsFor ?? 0))
            return (b.goalsFor ?? 0) - (a.goalsFor ?? 0);
        if ((b.wins ?? 0) !== (a.wins ?? 0))
            return (b.wins ?? 0) - (a.wins ?? 0);
        return 0;
    }).map((s, idx) => ({ ...s, rank: idx + 1 }));
}
export function applyHeadToHead(standings, matches) {
    const sorted = [...standings];
    for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].points === sorted[i + 1].points) {
            const tiedGroup = [sorted[i]];
            let j = i + 1;
            while (j < sorted.length && sorted[j].points === sorted[i].points) {
                tiedGroup.push(sorted[j]);
                j++;
            }
            if (tiedGroup.length > 1) {
                const h2hSorted = sortByHeadToHead(tiedGroup, matches);
                for (let k = 0; k < h2hSorted.length; k++) {
                    sorted[i + k] = h2hSorted[k];
                }
            }
            i = j - 1;
        }
    }
    return sorted.map((s, idx) => ({ ...s, rank: idx + 1 }));
}
function sortByHeadToHead(tied, matches) {
    const tiedIds = new Set(tied.map(s => s.participantId));
    const h2hPoints = new Map();
    for (const s of tied) {
        h2hPoints.set(s.participantId, 0);
    }
    for (const match of matches) {
        if (match.status !== 'completed')
            continue;
        const p1 = match.participant1Id;
        const p2 = match.participant2Id;
        if (!p1 || !p2 || !tiedIds.has(p1) || !tiedIds.has(p2))
            continue;
        if (match.winnerId === p1) {
            h2hPoints.set(p1, (h2hPoints.get(p1) || 0) + 3);
        }
        else if (match.winnerId === p2) {
            h2hPoints.set(p2, (h2hPoints.get(p2) || 0) + 3);
        }
        else {
            h2hPoints.set(p1, (h2hPoints.get(p1) || 0) + 1);
            h2hPoints.set(p2, (h2hPoints.get(p2) || 0) + 1);
        }
    }
    return tied.sort((a, b) => {
        const h2hA = h2hPoints.get(a.participantId) || 0;
        const h2hB = h2hPoints.get(b.participantId) || 0;
        if (h2hB !== h2hA)
            return h2hB - h2hA;
        return (b.goalDifference ?? 0) - (a.goalDifference ?? 0);
    });
}
function createStanding(participantId) {
    return {
        participantId,
        points: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        played: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0
    };
}
function countWins(matches, participantId) {
    return matches.filter(m => m.status === 'completed' && m.winnerId === participantId).length;
}
function countLosses(matches, participantId) {
    return matches.filter(m => m.status === 'completed' && m.loserId === participantId).length;
}
//# sourceMappingURL=standings-calculator.js.map