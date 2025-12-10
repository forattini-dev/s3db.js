import { BaseFormat } from './base-format.js';
import { RoundRobinFormat, RoundRobinConfig } from './round-robin.js';
import { SingleEliminationFormat, SingleEliminationConfig } from './single-elimination.js';
import { DoubleEliminationFormat, DoubleEliminationConfig } from './double-elimination.js';
import type {
  FormatConfig,
  ValidationResult,
  Bracket,
  Match,
  OnMatchCompleteResult,
  Standing,
  BracketMatch
} from '../types.js';

export interface LeaguePlayoffsConfig extends FormatConfig {
  leagueRounds?: number;
  leagueBestOf?: number;
  playoffsFormat?: 'single-elimination' | 'double-elimination';
  playoffsSize?: number;
  playoffsBestOf?: number;
  playoffsFinalsBestOf?: number;
  byesForTopSeeds?: number;
  thirdPlaceMatch?: boolean;
}

interface LeaguePhase {
  bracket: Bracket;
  standings: Standing[];
  complete: boolean;
}

interface PlayoffsPhase {
  bracket: Bracket | null;
  qualifiedParticipants: string[];
  complete: boolean;
}

interface LeaguePlayoffsBracket extends Bracket {
  phase: 'league' | 'playoffs';
  league: LeaguePhase;
  playoffs: PlayoffsPhase;
}

export class LeaguePlayoffsFormat extends BaseFormat {
  declare config: LeaguePlayoffsConfig;

  static override get type(): string {
    return 'league-playoffs';
  }

  static override get displayName(): string {
    return 'League + Playoffs (Liga + Mata-Mata)';
  }

  static override get defaultConfig(): LeaguePlayoffsConfig {
    return {
      leagueRounds: 2,
      leagueBestOf: 1,
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      playoffsFormat: 'single-elimination',
      playoffsSize: 8,
      playoffsBestOf: 3,
      playoffsFinalsBestOf: 5,
      byesForTopSeeds: 0,
      thirdPlaceMatch: false
    };
  }

  override validate(participants: string[], config: LeaguePlayoffsConfig): ValidationResult {
    const errors: string[] = [];

    if (!participants || participants.length < 4) {
      errors.push('Minimum 4 participants required');
    }

    const playoffsSize = config.playoffsSize || 8;
    if (playoffsSize > participants.length) {
      errors.push(`Playoffs size (${playoffsSize}) cannot exceed participant count`);
    }

    if (playoffsSize < 2) {
      errors.push('Playoffs must have at least 2 participants');
    }

    return { valid: errors.length === 0, errors };
  }

  generateBracket(participants: string[], config: LeaguePlayoffsConfig): LeaguePlayoffsBracket {
    const leagueFormat = new RoundRobinFormat({
      rounds: config.leagueRounds || 2,
      bestOf: config.leagueBestOf || 1,
      pointsWin: config.pointsWin,
      pointsDraw: config.pointsDraw,
      pointsLoss: config.pointsLoss
    });

    const leagueBracket = leagueFormat.generateBracket(participants, config as RoundRobinConfig);

    return {
      type: 'league-playoffs',
      config: { ...this.config, ...config },
      phase: 'league',
      participants: [...participants],
      league: {
        bracket: leagueBracket,
        standings: [],
        complete: false
      },
      playoffs: {
        bracket: null,
        qualifiedParticipants: [],
        complete: false
      }
    };
  }

  getInitialMatches(bracket: Bracket): Match[] {
    const lpBracket = bracket as LeaguePlayoffsBracket;
    const leagueFormat = new RoundRobinFormat(lpBracket.league.bracket.config as RoundRobinConfig);
    return leagueFormat.getInitialMatches(lpBracket.league.bracket);
  }

  onMatchComplete(bracket: Bracket, completedMatch: Match): OnMatchCompleteResult {
    const lpBracket = bracket as LeaguePlayoffsBracket;
    const newMatches: Match[] = [];

    if (lpBracket.phase === 'league') {
      return this._processLeagueMatch(lpBracket, completedMatch, newMatches);
    } else if (lpBracket.phase === 'playoffs') {
      return this._processPlayoffsMatch(lpBracket, completedMatch, newMatches);
    }

    return { bracket: lpBracket, newMatches };
  }

  private _processLeagueMatch(bracket: LeaguePlayoffsBracket, match: Match, newMatches: Match[]): OnMatchCompleteResult {
    const leagueFormat = new RoundRobinFormat(bracket.league.bracket.config as RoundRobinConfig);
    const { bracket: updatedLeagueBracket, newMatches: leagueNewMatches } =
      leagueFormat.onMatchComplete(bracket.league.bracket, match);

    bracket.league.bracket = updatedLeagueBracket;

    const allMatches = bracket.league.bracket.schedule!.flatMap(r => r.matches);
    const completedCount = allMatches.filter(m => m.status === 'completed').length;

    if (completedCount >= allMatches.length) {
      bracket.league.complete = true;
      bracket.league.standings = leagueFormat.getStandings(bracket.league.bracket, allMatches as unknown as Match[]);
      bracket.phase = 'playoffs';
      const playoffsMatches = this._initializePlayoffs(bracket);
      newMatches.push(...playoffsMatches);
    } else {
      newMatches.push(...leagueNewMatches);
    }

    return { bracket, newMatches };
  }

  private _initializePlayoffs(bracket: LeaguePlayoffsBracket): Match[] {
    const config = bracket.config as LeaguePlayoffsConfig;
    const playoffsSize = config.playoffsSize || 8;

    const qualifiedParticipants = bracket.league.standings
      .slice(0, playoffsSize)
      .map(s => s.participantId);

    bracket.playoffs.qualifiedParticipants = qualifiedParticipants;

    const PlayoffsFormat = config.playoffsFormat === 'double-elimination'
      ? DoubleEliminationFormat
      : SingleEliminationFormat;

    const playoffsConfig = config.playoffsFormat === 'double-elimination'
      ? {
          bestOf: config.playoffsBestOf || 3,
          grandFinalsBestOf: config.playoffsFinalsBestOf || 5
        } as DoubleEliminationConfig
      : {
          bestOf: config.playoffsBestOf || 3,
          finalsBestOf: config.playoffsFinalsBestOf || 5,
          thirdPlaceMatch: config.thirdPlaceMatch
        } as SingleEliminationConfig;

    const playoffsFormat = new PlayoffsFormat(playoffsConfig);
    bracket.playoffs.bracket = playoffsFormat.generateBracket(qualifiedParticipants, playoffsConfig);

    return playoffsFormat.getInitialMatches(bracket.playoffs.bracket).map(m => ({
      ...m,
      phase: 'playoffs'
    }));
  }

  private _processPlayoffsMatch(bracket: LeaguePlayoffsBracket, match: Match, newMatches: Match[]): OnMatchCompleteResult {
    const config = bracket.config as LeaguePlayoffsConfig;
    const PlayoffsFormat = config.playoffsFormat === 'double-elimination'
      ? DoubleEliminationFormat
      : SingleEliminationFormat;

    const playoffsFormat = new PlayoffsFormat(bracket.playoffs.bracket!.config as FormatConfig);
    const { bracket: updatedPlayoffsBracket, newMatches: playoffsNewMatches } =
      playoffsFormat.onMatchComplete(bracket.playoffs.bracket!, match);

    bracket.playoffs.bracket = updatedPlayoffsBracket;

    const allPlayoffsMatches = this._getAllPlayoffsMatches(bracket.playoffs.bracket!);
    if (playoffsFormat.isComplete(bracket.playoffs.bracket!, allPlayoffsMatches as Match[])) {
      bracket.playoffs.complete = true;
    }

    newMatches.push(...playoffsNewMatches.map(m => ({
      ...m,
      phase: 'playoffs'
    })));

    return { bracket, newMatches };
  }

  private _getAllPlayoffsMatches(playoffsBracket: Bracket): BracketMatch[] {
    if (playoffsBracket.winnersMatches) {
      return [
        ...playoffsBracket.winnersMatches.flat(),
        ...playoffsBracket.losersMatches!.flat(),
        playoffsBracket.grandFinals as unknown as BracketMatch
      ].filter(Boolean);
    }
    return playoffsBracket.matches!.flat();
  }

  getStandings(bracket: Bracket, matches: Match[]): Standing[] {
    const lpBracket = bracket as LeaguePlayoffsBracket;

    if (lpBracket.phase === 'league' || !lpBracket.playoffs.complete) {
      const leagueFormat = new RoundRobinFormat(lpBracket.league.bracket.config as RoundRobinConfig);
      return leagueFormat.getStandings(lpBracket.league.bracket, matches);
    }

    const standings: Standing[] = [];
    const playoffsMatches = matches.filter(m => m.phase === 'playoffs');

    const config = lpBracket.config as LeaguePlayoffsConfig;
    const PlayoffsFormat = config.playoffsFormat === 'double-elimination'
      ? DoubleEliminationFormat
      : SingleEliminationFormat;

    const playoffsFormat = new PlayoffsFormat(lpBracket.playoffs.bracket!.config as FormatConfig);
    const playoffsStandings = playoffsFormat.getStandings(lpBracket.playoffs.bracket!, playoffsMatches);

    for (const ps of playoffsStandings) {
      standings.push({
        ...ps,
        qualifiedForPlayoffs: true
      } as Standing & { qualifiedForPlayoffs: boolean });
    }

    const qualifiedIds = new Set(lpBracket.playoffs.qualifiedParticipants);
    const nonQualified = lpBracket.league.standings.filter(s => !qualifiedIds.has(s.participantId));

    for (const s of nonQualified) {
      standings.push({
        ...s,
        placement: standings.length + 1,
        qualifiedForPlayoffs: false
      } as Standing & { qualifiedForPlayoffs: boolean });
    }

    return standings;
  }

  isComplete(bracket: Bracket, _matches: Match[]): boolean {
    const lpBracket = bracket as LeaguePlayoffsBracket;
    return lpBracket.league.complete && lpBracket.playoffs.complete;
  }

  override getWinner(bracket: Bracket, matches: Match[]): string | null {
    const lpBracket = bracket as LeaguePlayoffsBracket;
    if (!this.isComplete(bracket, matches)) return null;

    const config = lpBracket.config as LeaguePlayoffsConfig;
    const PlayoffsFormat = config.playoffsFormat === 'double-elimination'
      ? DoubleEliminationFormat
      : SingleEliminationFormat;

    const playoffsFormat = new PlayoffsFormat(lpBracket.playoffs.bracket!.config as FormatConfig);
    const playoffsMatches = matches.filter(m => m.phase === 'playoffs');

    return playoffsFormat.getWinner(lpBracket.playoffs.bracket!, playoffsMatches);
  }

  override getCurrentPhase(bracket: Bracket, _matches: Match[]): string {
    return (bracket as LeaguePlayoffsBracket).phase;
  }

  override getCurrentRound(bracket: Bracket, matches: Match[]): number {
    const lpBracket = bracket as LeaguePlayoffsBracket;

    if (lpBracket.phase === 'league') {
      const leagueFormat = new RoundRobinFormat(lpBracket.league.bracket.config as RoundRobinConfig);
      return leagueFormat.getCurrentRound(lpBracket.league.bracket, matches);
    }

    const config = lpBracket.config as LeaguePlayoffsConfig;
    const PlayoffsFormat = config.playoffsFormat === 'double-elimination'
      ? DoubleEliminationFormat
      : SingleEliminationFormat;

    const playoffsFormat = new PlayoffsFormat(lpBracket.playoffs.bracket!.config as FormatConfig);
    const playoffsMatches = matches.filter(m => m.phase === 'playoffs');

    return playoffsFormat.getCurrentRound(lpBracket.playoffs.bracket!, playoffsMatches);
  }

  getLeagueStandings(bracket: Bracket, matches: Match[]): Standing[] {
    const lpBracket = bracket as LeaguePlayoffsBracket;
    const leagueFormat = new RoundRobinFormat(lpBracket.league.bracket.config as RoundRobinConfig);
    const leagueMatches = matches.filter(m => m.phase === 'league' || !m.phase);
    return leagueFormat.getStandings(lpBracket.league.bracket, leagueMatches);
  }

  getQualifiedParticipants(bracket: Bracket): string[] {
    return (bracket as LeaguePlayoffsBracket).playoffs.qualifiedParticipants;
  }
}
