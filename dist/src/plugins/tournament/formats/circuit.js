import { BaseFormat } from './base-format.js';
import { calculateCircuitStandings } from '../standings-calculator.js';
export class CircuitFormat extends BaseFormat {
    static get type() {
        return 'circuit';
    }
    static get displayName() {
        return 'Circuit (Circuito de Pontos)';
    }
    static get defaultConfig() {
        return {
            pointsTable: {
                1: 100,
                2: 75,
                3: 50,
                4: 40,
                5: 32,
                6: 24,
                7: 18,
                8: 12,
                9: 8,
                10: 4,
                11: 2,
                12: 1
            },
            countBestN: null,
            qualifyTop: 8,
            seasonDuration: null,
            eventTiers: {
                major: 2.0,
                premier: 1.5,
                standard: 1.0,
                minor: 0.5
            }
        };
    }
    validate(participants, _config) {
        const errors = [];
        if (!participants || participants.length < 2) {
            errors.push('Minimum 2 participants required');
        }
        return { valid: errors.length === 0, errors };
    }
    generateBracket(participants, config) {
        return {
            type: 'circuit',
            config: { ...this.config, ...config },
            participants: [...participants],
            events: [],
            standings: participants.map(p => ({
                participantId: p,
                totalPoints: 0,
                eventResults: [],
                eventsPlayed: 0,
                bestPlacements: []
            })),
            currentSeason: 1,
            seasonStartedAt: Date.now(),
            seasonEndsAt: config.seasonDuration ? Date.now() + config.seasonDuration : null
        };
    }
    getInitialMatches(_bracket) {
        return [];
    }
    onMatchComplete(bracket, _completedMatch) {
        return { bracket, newMatches: [] };
    }
    addEvent(bracket, event) {
        const circuitBracket = bracket;
        const { id, name, tier = 'standard', results } = event;
        const config = circuitBracket.config;
        const multiplier = config.eventTiers?.[tier] || 1.0;
        const pointsTable = config.pointsTable || {};
        const eventWithPoints = {
            id,
            name,
            tier,
            multiplier,
            completedAt: Date.now(),
            points: {},
            results: results.map(r => ({
                participantId: r.participantId,
                placement: r.placement,
                points: Math.round((pointsTable[r.placement] || 0) * multiplier)
            }))
        };
        circuitBracket.events.push(eventWithPoints);
        for (const result of eventWithPoints.results) {
            const standing = circuitBracket.standings.find(s => s.participantId === result.participantId);
            if (standing) {
                standing.eventResults.push({
                    eventId: id,
                    eventName: name,
                    placement: result.placement,
                    points: result.points
                });
                standing.eventsPlayed++;
                standing.bestPlacements.push(result.placement);
            }
        }
        this._recalculateStandings(circuitBracket);
        return circuitBracket;
    }
    _recalculateStandings(bracket) {
        const config = bracket.config;
        const countBestN = config.countBestN;
        for (const standing of bracket.standings) {
            let pointsToCount = standing.eventResults.map(r => r.points);
            if (countBestN && pointsToCount.length > countBestN) {
                pointsToCount = pointsToCount
                    .sort((a, b) => b - a)
                    .slice(0, countBestN);
            }
            standing.totalPoints = pointsToCount.reduce((sum, p) => sum + p, 0);
            standing.bestPlacements = standing.eventResults
                .map(r => r.placement)
                .sort((a, b) => a - b)
                .slice(0, 5);
        }
        bracket.standings.sort((a, b) => {
            if (b.totalPoints !== a.totalPoints)
                return b.totalPoints - a.totalPoints;
            if (b.eventsPlayed !== a.eventsPlayed)
                return b.eventsPlayed - a.eventsPlayed;
            const bestA = Math.min(...a.bestPlacements) || 999;
            const bestB = Math.min(...b.bestPlacements) || 999;
            return bestA - bestB;
        });
    }
    getStandings(bracket, _matches) {
        const circuitBracket = bracket;
        return calculateCircuitStandings(circuitBracket.events);
    }
    isComplete(bracket, _matches) {
        const circuitBracket = bracket;
        if (circuitBracket.seasonEndsAt && Date.now() >= circuitBracket.seasonEndsAt) {
            return true;
        }
        return false;
    }
    getWinner(bracket, matches) {
        if (!this.isComplete(bracket, matches))
            return null;
        const standings = this.getStandings(bracket, matches);
        return standings.length > 0 ? standings[0].participantId : null;
    }
    getCurrentPhase(_bracket, _matches) {
        return 'circuit';
    }
    getCurrentRound(bracket, _matches) {
        return bracket.events.length;
    }
    getQualifiedParticipants(bracket) {
        const circuitBracket = bracket;
        const qualifyTop = circuitBracket.config.qualifyTop || 8;
        return circuitBracket.standings
            .slice(0, qualifyTop)
            .map(s => s.participantId);
    }
    getParticipantHistory(bracket, participantId) {
        const circuitBracket = bracket;
        const standing = circuitBracket.standings.find(s => s.participantId === participantId);
        if (!standing)
            return null;
        return {
            participantId,
            totalPoints: standing.totalPoints,
            eventsPlayed: standing.eventsPlayed,
            results: standing.eventResults,
            rank: circuitBracket.standings.indexOf(standing) + 1
        };
    }
    getEventList(bracket) {
        const circuitBracket = bracket;
        return circuitBracket.events.map(e => ({
            id: e.id,
            name: e.name,
            tier: e.tier,
            multiplier: e.multiplier,
            completedAt: e.completedAt,
            participantCount: e.results.length
        }));
    }
    completeCircuit(bracket) {
        const circuitBracket = bracket;
        circuitBracket.seasonEndsAt = Date.now();
        return circuitBracket;
    }
}
//# sourceMappingURL=circuit.js.map