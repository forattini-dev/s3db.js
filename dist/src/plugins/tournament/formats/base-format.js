export class BaseFormat {
    config;
    constructor(config = {}) {
        this.config = config;
    }
    static get type() {
        throw new Error('Format must define static type getter');
    }
    static get displayName() {
        throw new Error('Format must define static displayName getter');
    }
    static get defaultConfig() {
        return {
            bestOf: 1,
            pointsWin: 3,
            pointsDraw: 1,
            pointsLoss: 0
        };
    }
    validate(participants, _config) {
        const errors = [];
        if (!participants || participants.length < 2) {
            errors.push('Minimum 2 participants required');
        }
        return { valid: errors.length === 0, errors };
    }
    getNextMatches(_bracket, _completedMatches) {
        return [];
    }
    getWinner(bracket, matches) {
        if (!this.isComplete(bracket, matches)) {
            return null;
        }
        const standings = this.getStandings(bracket, matches);
        return standings.length > 0 ? standings[0].participantId : null;
    }
    getCurrentPhase(_bracket, _matches) {
        return 'main';
    }
    getCurrentRound(_bracket, matches) {
        const completedMatches = matches.filter(m => m.status === 'completed');
        if (completedMatches.length === 0)
            return 1;
        return Math.max(...completedMatches.map(m => m.round)) + 1;
    }
    serialize(bracket) {
        return {
            type: this.constructor.type,
            config: this.config,
            bracket
        };
    }
    static deserialize(data) {
        return data.bracket;
    }
    calculateTiebreaker(participantStats) {
        return participantStats.goalDifference || 0;
    }
    sortStandings(standings) {
        return standings.sort((a, b) => {
            if ((b.points ?? 0) !== (a.points ?? 0))
                return (b.points ?? 0) - (a.points ?? 0);
            if ((b.wins ?? 0) !== (a.wins ?? 0))
                return (b.wins ?? 0) - (a.wins ?? 0);
            const tiebreakerA = this.calculateTiebreaker(a);
            const tiebreakerB = this.calculateTiebreaker(b);
            if (tiebreakerB !== tiebreakerA)
                return tiebreakerB - tiebreakerA;
            return 0;
        });
    }
    createMatchTemplate({ phase, round, matchNumber, participant1Id, participant2Id, bestOf, nextMatchId, loserNextMatchId, groupId }) {
        return {
            id: '',
            phase: phase || 'main',
            round,
            matchNumber,
            participant1Id: participant1Id || null,
            participant2Id: participant2Id || null,
            bestOf: bestOf || this.config.bestOf || 1,
            score1: 0,
            score2: 0,
            games: [],
            winnerId: null,
            loserId: null,
            status: 'pending',
            nextMatchId: nextMatchId || null,
            loserNextMatchId: loserNextMatchId || null,
            groupId: groupId || null,
            scheduledAt: null,
            startedAt: null,
            completedAt: null,
            metadata: {}
        };
    }
}
//# sourceMappingURL=base-format.js.map