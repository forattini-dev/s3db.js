import { BaseFormat } from './base-format.js';
import { generateSwissPairing } from '../bracket-generator.js';
import { calculateSwissStandings } from '../standings-calculator.js';
export class SwissFormat extends BaseFormat {
    static get type() {
        return 'swiss';
    }
    static get displayName() {
        return 'Swiss System (Sistema Suíço)';
    }
    static get defaultConfig() {
        return {
            rounds: 5,
            bestOf: 3,
            advanceWins: 3,
            eliminateLosses: 3,
            avoidRematches: true,
            buchholzTiebreaker: true
        };
    }
    validate(participants, config) {
        const errors = [];
        if (!participants || participants.length < 2) {
            errors.push('Minimum 2 participants required');
        }
        if (participants.length > 64) {
            errors.push('Swiss format not recommended for more than 64 participants');
        }
        const rounds = config.rounds || 5;
        if (rounds < 1) {
            errors.push('At least 1 round required');
        }
        if (config.advanceWins && config.advanceWins > rounds) {
            errors.push('Advance wins cannot exceed total rounds');
        }
        if (config.eliminateLosses && config.eliminateLosses > rounds) {
            errors.push('Elimination losses cannot exceed total rounds');
        }
        return { valid: errors.length === 0, errors };
    }
    generateBracket(participants, config) {
        return {
            type: 'swiss',
            participants: [...participants],
            config: { ...this.config, ...config },
            rounds: config.rounds || 5,
            currentRound: 1,
            pairings: [],
            standings: participants.map(p => ({
                participantId: p,
                wins: 0,
                losses: 0,
                matchWins: 0,
                matchLosses: 0,
                buchholz: 0,
                opponents: [],
                status: 'active'
            })),
            advanced: [],
            eliminated: []
        };
    }
    getInitialMatches(bracket) {
        const swissBracket = bracket;
        const activeParticipants = swissBracket.standings
            .filter(s => s.status === 'active')
            .map(s => s.participantId);
        const shuffled = [...activeParticipants].sort(() => Math.random() - 0.5);
        const pairings = [];
        for (let i = 0; i < shuffled.length; i += 2) {
            if (shuffled[i + 1]) {
                pairings.push({
                    id: `R1M${Math.floor(i / 2) + 1}`,
                    round: 1,
                    matchNumber: Math.floor(i / 2) + 1,
                    participant1Id: shuffled[i],
                    participant2Id: shuffled[i + 1],
                    bestOf: swissBracket.config.bestOf,
                    status: 'pending'
                });
            }
            else {
                pairings.push({
                    id: `R1M${Math.floor(i / 2) + 1}`,
                    round: 1,
                    matchNumber: Math.floor(i / 2) + 1,
                    participant1Id: shuffled[i],
                    participant2Id: null,
                    bestOf: 1,
                    status: 'bye',
                    winnerId: shuffled[i]
                });
            }
        }
        swissBracket.pairings.push(pairings);
        return pairings
            .filter(p => p.status === 'pending')
            .map(p => ({
            ...this.createMatchTemplate({
                phase: 'swiss',
                round: p.round,
                matchNumber: p.matchNumber,
                participant1Id: p.participant1Id,
                participant2Id: p.participant2Id,
                bestOf: p.bestOf
            }),
            id: p.id
        }));
    }
    onMatchComplete(bracket, completedMatch) {
        const swissBracket = bracket;
        const { winnerId, loserId, score1, score2 } = completedMatch;
        const newMatches = [];
        const config = swissBracket.config;
        const winnerStanding = swissBracket.standings.find(s => s.participantId === winnerId);
        const loserStanding = swissBracket.standings.find(s => s.participantId === loserId);
        if (winnerStanding) {
            winnerStanding.wins++;
            winnerStanding.matchWins += score1;
            winnerStanding.matchLosses += score2;
            winnerStanding.opponents.push(loserId);
            if (config.advanceWins && winnerStanding.wins >= config.advanceWins) {
                winnerStanding.status = 'advanced';
                swissBracket.advanced.push(winnerId);
            }
        }
        if (loserStanding) {
            loserStanding.losses++;
            loserStanding.matchWins += score2;
            loserStanding.matchLosses += score1;
            loserStanding.opponents.push(winnerId);
            if (config.eliminateLosses && loserStanding.losses >= config.eliminateLosses) {
                loserStanding.status = 'eliminated';
                swissBracket.eliminated.push(loserId);
            }
        }
        this._updateBuchholz(swissBracket);
        const currentRoundPairings = swissBracket.pairings[swissBracket.currentRound - 1] || [];
        const completedInRound = currentRoundPairings.filter(p => p.status === 'completed' || p.status === 'bye' || p.id === completedMatch.id);
        if (completedInRound.length === currentRoundPairings.length) {
            if (swissBracket.currentRound < swissBracket.rounds && !this._isSwissComplete(swissBracket)) {
                swissBracket.currentRound = swissBracket.currentRound + 1;
                const nextPairings = this._generateNextRound(swissBracket);
                swissBracket.pairings.push(nextPairings);
                for (const p of nextPairings.filter(m => m.status === 'pending')) {
                    newMatches.push({
                        ...this.createMatchTemplate({
                            phase: 'swiss',
                            round: p.round,
                            matchNumber: p.matchNumber,
                            participant1Id: p.participant1Id,
                            participant2Id: p.participant2Id,
                            bestOf: p.bestOf
                        }),
                        id: p.id
                    });
                }
            }
        }
        return { bracket: swissBracket, newMatches };
    }
    _generateNextRound(bracket) {
        const activeStandings = bracket.standings
            .filter(s => s.status === 'active')
            .map(s => ({ participantId: s.participantId, points: s.wins }));
        const previousMatches = bracket.pairings.flat().map(p => ({
            participant1Id: p.participant1Id,
            participant2Id: p.participant2Id
        }));
        const pairings = generateSwissPairing({
            participants: activeStandings.map(s => s.participantId),
            standings: activeStandings,
            completedPairings: previousMatches
        });
        return pairings.map((p, i) => ({
            id: `R${bracket.currentRound}M${i + 1}`,
            round: bracket.currentRound,
            matchNumber: i + 1,
            participant1Id: p.participant1Id,
            participant2Id: p.participant2Id,
            bestOf: bracket.config.bestOf,
            status: p.participant2Id ? 'pending' : 'bye',
            winnerId: p.participant2Id ? null : p.participant1Id
        }));
    }
    _updateBuchholz(bracket) {
        for (const standing of bracket.standings) {
            standing.buchholz = standing.opponents.reduce((sum, oppId) => {
                const oppStanding = bracket.standings.find(s => s.participantId === oppId);
                return sum + (oppStanding ? oppStanding.wins : 0);
            }, 0);
        }
    }
    _isSwissComplete(bracket) {
        const activeCount = bracket.standings.filter(s => s.status === 'active').length;
        return activeCount <= 1;
    }
    getStandings(bracket, matches) {
        return calculateSwissStandings(matches, bracket.participants);
    }
    isComplete(bracket, _matches) {
        const swissBracket = bracket;
        if (swissBracket.currentRound >= swissBracket.rounds)
            return true;
        return this._isSwissComplete(swissBracket);
    }
    getWinner(bracket, matches) {
        if (!this.isComplete(bracket, matches))
            return null;
        const standings = this.getStandings(bracket, matches);
        return standings.length > 0 ? standings[0].participantId : null;
    }
    getCurrentPhase(_bracket, _matches) {
        return 'swiss';
    }
    getCurrentRound(bracket, _matches) {
        return bracket.currentRound || 1;
    }
    getAdvanced(bracket) {
        return bracket.advanced;
    }
    getEliminated(bracket) {
        return bracket.eliminated;
    }
    getRecordDisplay(wins, losses) {
        return `${wins}-${losses}`;
    }
}
//# sourceMappingURL=swiss.js.map