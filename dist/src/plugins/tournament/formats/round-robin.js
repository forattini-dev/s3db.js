import { BaseFormat } from './base-format.js';
import { generateRoundRobinSchedule } from '../bracket-generator.js';
import { calculateRoundRobinStandings, applyHeadToHead } from '../standings-calculator.js';
export class RoundRobinFormat extends BaseFormat {
    static get type() {
        return 'round-robin';
    }
    static get displayName() {
        return 'Round Robin (Pontos Corridos)';
    }
    static get defaultConfig() {
        return {
            rounds: 1,
            bestOf: 1,
            pointsWin: 3,
            pointsDraw: 1,
            pointsLoss: 0,
            tiebreaker: 'goal-difference',
            allowDraws: true
        };
    }
    validate(participants, config) {
        const errors = [];
        if (!participants || participants.length < 2) {
            errors.push('Minimum 2 participants required');
        }
        if (participants.length > 30) {
            errors.push('Round robin not recommended for more than 30 participants');
        }
        if (config.rounds && config.rounds < 1) {
            errors.push('At least 1 round required');
        }
        return { valid: errors.length === 0, errors };
    }
    generateBracket(participants, config) {
        const schedule = generateRoundRobinSchedule(participants, {
            rounds: config.rounds || 1,
            bestOf: config.bestOf || 1
        });
        return {
            type: 'round-robin',
            participants: [...participants],
            config: { ...this.config, ...config },
            schedule: schedule.schedule,
            currentRound: 1
        };
    }
    getInitialMatches(bracket) {
        if (!bracket.schedule || bracket.schedule.length === 0)
            return [];
        const allMatches = bracket.schedule.flatMap(round => round.matches);
        return allMatches.map(match => ({
            ...this.createMatchTemplate({
                phase: 'league',
                round: match.round,
                matchNumber: match.matchNumber,
                participant1Id: match.participant1Id,
                participant2Id: match.participant2Id,
                bestOf: match.bestOf || this.config.bestOf
            }),
            id: match.id
        }));
    }
    onMatchComplete(bracket, completedMatch) {
        const newMatches = [];
        const allMatches = bracket.schedule.flatMap(round => round.matches);
        const matchKey = completedMatch.metadata?.matchRef || completedMatch.id;
        const scheduleMatch = allMatches.find(m => m.id === matchKey);
        if (scheduleMatch) {
            scheduleMatch.status = 'completed';
            scheduleMatch.winnerId = completedMatch.winnerId;
            scheduleMatch.score1 = completedMatch.score1;
            scheduleMatch.score2 = completedMatch.score2;
        }
        const currentRoundMatches = allMatches.filter(m => m.round === bracket.currentRound);
        const completedInRound = currentRoundMatches.filter(m => m.status === 'completed' || m.id === matchKey);
        if (completedInRound.length === currentRoundMatches.length) {
            const nextRoundIndex = bracket.currentRound;
            if (nextRoundIndex < bracket.schedule.length) {
                bracket.currentRound = bracket.currentRound + 1;
            }
        }
        return { bracket, newMatches };
    }
    getNextMatches(bracket, completedMatches) {
        const completedIds = new Set(completedMatches.map(m => m.id));
        const allMatches = bracket.schedule.flatMap(round => round.matches);
        return allMatches
            .filter(m => !completedIds.has(m.id) && m.round === bracket.currentRound)
            .map(m => this.createMatchTemplate({
            phase: 'league',
            round: m.round,
            matchNumber: m.matchNumber,
            participant1Id: m.participant1Id,
            participant2Id: m.participant2Id,
            bestOf: m.bestOf
        }));
    }
    getStandings(bracket, matches) {
        const standings = calculateRoundRobinStandings(matches, {
            pointsWin: this.config.pointsWin,
            pointsDraw: this.config.pointsDraw,
            pointsLoss: this.config.pointsLoss
        });
        if (this.config.tiebreaker === 'head-to-head') {
            const pointGroups = new Map();
            for (const s of standings) {
                const key = s.points ?? 0;
                if (!pointGroups.has(key))
                    pointGroups.set(key, []);
                pointGroups.get(key).push(s);
            }
            const result = [];
            for (const [_points, group] of pointGroups) {
                if (group.length > 1) {
                    result.push(...applyHeadToHead(group, matches));
                }
                else {
                    result.push(...group);
                }
            }
            return result.sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
        }
        return standings;
    }
    isComplete(bracket, matches) {
        const totalMatchesExpected = bracket.schedule.flatMap(r => r.matches).length;
        const completedMatches = matches.filter(m => m.status === 'completed');
        return completedMatches.length >= totalMatchesExpected;
    }
    getWinner(bracket, matches) {
        if (!this.isComplete(bracket, matches))
            return null;
        const standings = this.getStandings(bracket, matches);
        return standings.length > 0 ? standings[0].participantId : null;
    }
    getCurrentPhase(_bracket, _matches) {
        return 'league';
    }
    getCurrentRound(bracket, _matches) {
        return bracket.currentRound || 1;
    }
    calculateTiebreaker(participantStats) {
        switch (this.config.tiebreaker) {
            case 'goals-scored':
                return participantStats.goalsFor || 0;
            case 'head-to-head':
                return participantStats.h2hPoints || 0;
            case 'goal-difference':
            default:
                return participantStats.goalDifference || 0;
        }
    }
    getTotalRounds(participants, config) {
        const n = participants.length;
        const matchesPerRound = n % 2 === 0 ? n - 1 : n;
        return matchesPerRound * (config.rounds || 1);
    }
    getTotalMatches(participants, config) {
        const n = participants.length;
        const matchesPerTurn = (n * (n - 1)) / 2;
        return matchesPerTurn * (config.rounds || 1);
    }
}
//# sourceMappingURL=round-robin.js.map