export interface FormatConfig {
  bestOf?: number;
  pointsWin?: number;
  pointsDraw?: number;
  pointsLoss?: number;
  [key: string]: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface Bracket {
  config?: FormatConfig;
  rounds?: number;
  matches?: BracketMatch[][];
  winnersMatches?: BracketMatch[][];
  losersMatches?: BracketMatch[][];
  winnersRounds?: number;
  losersRounds?: number;
  grandFinals?: GrandFinals;
  grandFinalsReset?: boolean | null;
  thirdPlaceMatch?: ThirdPlaceMatch | null;
  participants?: string[];
  groups?: Group[];
  schedule?: ScheduleRound[];
  currentRound?: number;
  roundMatches?: RoundMatch[];
  rankings?: LadderRanking[];
  pendingChallenges?: PendingChallenge[];
  events?: CircuitEvent[];
  divisions?: Division[];
  season?: number;
  [key: string]: unknown;
}

export interface BracketMatch {
  id: string;
  round: number;
  matchNumber: number;
  participant1Id: string | null;
  participant2Id: string | null;
  winnerId: string | null;
  loserId?: string | null;
  status: MatchStatus;
  bestOf?: number;
  nextMatchId?: string | null;
  loserNextMatchId?: string | null;
  score1?: number;
  score2?: number;
  groupId?: string | null;
}

export interface GrandFinals {
  id?: string;
  participant1Id: string | null;
  participant2Id: string | null;
  winnerId: string | null;
  loserId?: string | null;
  status: MatchStatus;
}

export interface ThirdPlaceMatch {
  id: string;
  round: number;
  participant1Id: string | null;
  participant2Id: string | null;
  status: MatchStatus;
  winnerId: string | null;
}

export interface Group {
  id: string;
  name: string;
  participants: string[];
  matches: BracketMatch[];
  standings: GroupStanding[];
}

export interface GroupStanding {
  participantId: string;
  rank: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface ScheduleRound {
  round: number;
  matches: BracketMatch[];
}

export interface RoundMatch {
  round: number;
  pairings: SwissPairing[];
}

export interface SwissPairing {
  id: string;
  participant1Id: string | null;
  participant2Id: string | null;
  winnerId: string | null;
  status: MatchStatus;
}

export interface LadderRanking {
  participantId: string;
  rank: number;
  rating: number;
  wins: number;
  losses: number;
  streak: number;
  lastActivity: number;
  protectedUntil?: number;
}

export interface PendingChallenge {
  id: string;
  challengerId: string;
  defenderId: string;
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  createdAt: number;
  expiresAt: number;
}

export interface CircuitEvent {
  id: string;
  name: string;
  tier: string;
  points: Record<number, number>;
  results: CircuitResult[];
  completedAt?: number;
}

export interface CircuitResult {
  participantId: string;
  placement: number;
  points: number;
}

export interface Division {
  id: string;
  name: string;
  tier: number;
  participants: string[];
  schedule: ScheduleRound[];
  standings: DivisionStanding[];
  promotionSpots?: number;
  relegationSpots?: number;
}

export interface DivisionStanding {
  participantId: string;
  rank: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export type MatchStatus = 'pending' | 'scheduled' | 'in-progress' | 'completed' | 'bye' | 'cancelled';

export interface Match {
  id: string;
  tournamentId?: string;
  phase: string;
  round: number;
  matchNumber: number;
  participant1Id: string | null;
  participant2Id: string | null;
  bestOf: number;
  score1: number;
  score2: number;
  games: Game[];
  winnerId: string | null;
  loserId: string | null;
  status: MatchStatus;
  nextMatchId: string | null;
  loserNextMatchId?: string | null;
  groupId: string | null;
  scheduledAt: number | null;
  startedAt: number | null;
  completedAt: number | null;
  metadata: Record<string, unknown>;
}

export interface Game {
  gameNumber: number;
  score1: number;
  score2: number;
  winnerId: string | null;
  completedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface MatchTemplateParams {
  phase?: string;
  round: number;
  matchNumber: number;
  participant1Id?: string | null;
  participant2Id?: string | null;
  bestOf?: number;
  nextMatchId?: string | null;
  loserNextMatchId?: string | null;
  groupId?: string | null;
}

export interface OnMatchCompleteResult {
  bracket: Bracket;
  newMatches: Match[];
}

export interface Standing {
  participantId: string;
  rank?: number;
  placement?: number;
  points?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  played?: number;
  goalsFor?: number;
  goalsAgainst?: number;
  goalDifference?: number;
  tiebreaker?: number;
  buchholz?: number;
  rating?: number;
  eliminatedPhase?: string | null;
  eliminatedRound?: number;
  [key: string]: unknown;
}

export interface SerializedFormat {
  type: string;
  config: FormatConfig;
  bracket: Bracket;
}

export interface ChallengeResult {
  valid: boolean;
  error?: string;
  match?: Match;
}
