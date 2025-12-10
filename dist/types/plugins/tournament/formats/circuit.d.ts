import { BaseFormat } from './base-format.js';
import type { FormatConfig, ValidationResult, Bracket, Match, OnMatchCompleteResult, Standing, CircuitEvent } from '../types.js';
export interface CircuitConfig extends FormatConfig {
    pointsTable?: Record<number, number>;
    countBestN?: number | null;
    qualifyTop?: number;
    seasonDuration?: number | null;
    eventTiers?: Record<string, number>;
}
interface CircuitStandingEntry {
    participantId: string;
    totalPoints: number;
    eventResults: {
        eventId: string;
        eventName: string;
        placement: number;
        points: number;
    }[];
    eventsPlayed: number;
    bestPlacements: number[];
}
interface CircuitEventEntry extends CircuitEvent {
    multiplier: number;
    completedAt: number;
}
interface CircuitBracket extends Bracket {
    events: CircuitEventEntry[];
    standings: CircuitStandingEntry[];
    currentSeason: number;
    seasonStartedAt: number;
    seasonEndsAt: number | null;
}
export interface AddEventInput {
    id: string;
    name: string;
    tier?: string;
    results: {
        participantId: string;
        placement: number;
    }[];
}
export declare class CircuitFormat extends BaseFormat {
    config: CircuitConfig;
    static get type(): string;
    static get displayName(): string;
    static get defaultConfig(): CircuitConfig;
    validate(participants: string[], _config: CircuitConfig): ValidationResult;
    generateBracket(participants: string[], config: CircuitConfig): CircuitBracket;
    getInitialMatches(_bracket: Bracket): Match[];
    onMatchComplete(bracket: Bracket, _completedMatch: Match): OnMatchCompleteResult;
    addEvent(bracket: Bracket, event: AddEventInput): Bracket;
    private _recalculateStandings;
    getStandings(bracket: Bracket, _matches: Match[]): Standing[];
    isComplete(bracket: Bracket, _matches: Match[]): boolean;
    getWinner(bracket: Bracket, matches: Match[]): string | null;
    getCurrentPhase(_bracket: Bracket, _matches: Match[]): string;
    getCurrentRound(bracket: Bracket, _matches: Match[]): number;
    getQualifiedParticipants(bracket: Bracket): string[];
    getParticipantHistory(bracket: Bracket, participantId: string): {
        participantId: string;
        totalPoints: number;
        eventsPlayed: number;
        results: CircuitStandingEntry['eventResults'];
        rank: number;
    } | null;
    getEventList(bracket: Bracket): {
        id: string;
        name: string;
        tier: string;
        multiplier: number;
        completedAt: number;
        participantCount: number;
    }[];
    completeCircuit(bracket: Bracket): Bracket;
}
export {};
//# sourceMappingURL=circuit.d.ts.map