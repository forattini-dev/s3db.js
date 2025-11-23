/**
 * Tournament Plugin Tests
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Database } from '../../../src/database.class.js';
import { TournamentPlugin } from '../../../src/plugins/tournament.plugin.js';

describe('TournamentPlugin', () => {
  let database;
  let tournament;

  beforeAll(async () => {
    database = new Database({
      connectionString: 'memory://test-bucket/tournament-tests'
    });
    await database.connect();

    tournament = new TournamentPlugin({
      logLevel: 'silent'
    });
    await database.usePlugin(tournament, 'tournament');
  });

  afterAll(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  describe('Plugin Initialization', () => {
    it('should initialize with available formats', () => {
      const formats = tournament.getAvailableFormats();
      expect(formats).toContain('round-robin');
      expect(formats).toContain('single-elimination');
      expect(formats).toContain('double-elimination');
      expect(formats).toContain('swiss');
      expect(formats).toContain('group-stage');
      expect(formats).toContain('league-playoffs');
      expect(formats).toContain('ladder');
      expect(formats).toContain('circuit');
      expect(formats).toContain('promotion-relegation');
    });

    it('should provide format metadata', () => {
      const metadata = tournament.getFormatMetadata();
      expect(metadata.length).toBeGreaterThan(0);
      expect(metadata[0]).toHaveProperty('type');
      expect(metadata[0]).toHaveProperty('displayName');
      expect(metadata[0]).toHaveProperty('defaultConfig');
    });
  });

  describe('Tournament CRUD', () => {
    let tournamentId;

    it('should create a tournament', async () => {
      const result = await tournament.create({
        name: 'Test Tournament',
        organizerId: 'org-123',
        format: 'single-elimination',
        participantType: 'team',
        config: { bestOf: 3 }
      });

      expect(result).toHaveProperty('id');
      expect(result.name).toBe('Test Tournament');
      expect(result.format).toBe('single-elimination');
      expect(result.status).toBe('draft');
      tournamentId = result.id;
    });

    it('should get a tournament', async () => {
      const result = await tournament.get(tournamentId);
      expect(result.id).toBe(tournamentId);
      expect(result.name).toBe('Test Tournament');
    });

    it('should update a tournament', async () => {
      const result = await tournament.update(tournamentId, {
        name: 'Updated Tournament'
      });
      expect(result.name).toBe('Updated Tournament');
    });

    it('should list tournaments', async () => {
      const results = await tournament.list({ organizerId: 'org-123' });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should delete a tournament', async () => {
      await tournament.delete(tournamentId);
      // After delete, get() throws NoSuchKey error
      await expect(tournament.get(tournamentId)).rejects.toThrow();
    });
  });

  describe('Registration Flow', () => {
    let tournamentId;

    beforeEach(async () => {
      const t = await tournament.create({
        name: 'Registration Test',
        organizerId: 'org-456',
        format: 'single-elimination',
        participantType: 'team'
      });
      tournamentId = t.id;
    });

    it('should open registration', async () => {
      await tournament.openRegistration(tournamentId);
      const t = await tournament.get(tournamentId);
      expect(t.status).toBe('registration');
    });

    it('should register participants', async () => {
      await tournament.openRegistration(tournamentId);

      const reg = await tournament.register(tournamentId, 'team-1');
      expect(reg).toHaveProperty('id');
      expect(reg.participantId).toBe('team-1');
      expect(reg.status).toBe('pending');
    });

    it('should confirm registration', async () => {
      await tournament.openRegistration(tournamentId);
      await tournament.register(tournamentId, 'team-1');
      await tournament.confirmRegistration(tournamentId, 'team-1');

      const participants = await tournament.getParticipants(tournamentId);
      const team1 = participants.find(p => p.participantId === 'team-1');
      expect(team1.status).toBe('confirmed');
    });

    it('should set seeds', async () => {
      await tournament.openRegistration(tournamentId);
      await tournament.register(tournamentId, 'team-1');
      await tournament.setSeed(tournamentId, 'team-1', 1);

      const participants = await tournament.getParticipants(tournamentId);
      const team1 = participants.find(p => p.participantId === 'team-1');
      expect(team1.seed).toBe(1);
    });
  });

  describe('Single Elimination Tournament', () => {
    let tournamentId;

    beforeEach(async () => {
      const t = await tournament.create({
        name: 'Single Elim Test',
        organizerId: 'org-789',
        format: 'single-elimination',
        participantType: 'team',
        config: { bestOf: 1 }
      });
      tournamentId = t.id;

      await tournament.openRegistration(tournamentId);

      // Register 4 teams
      for (let i = 1; i <= 4; i++) {
        await tournament.register(tournamentId, `team-${i}`);
        await tournament.confirmRegistration(tournamentId, `team-${i}`);
      }
    });

    it('should start tournament and create matches', async () => {
      await tournament.startTournament(tournamentId);

      const t = await tournament.get(tournamentId);
      expect(t.status).toBe('in-progress');
      expect(t.bracket).toBeDefined();

      const matches = await tournament.getMatches(tournamentId);
      expect(matches.length).toBeGreaterThan(0);
    });

    it('should report match results', async () => {
      await tournament.startTournament(tournamentId);

      const matches = await tournament.getMatches(tournamentId, { status: 'pending' });
      expect(matches.length).toBeGreaterThan(0);

      const match = matches[0];
      const result = await tournament.reportResult(match.id, {
        score1: 1,
        score2: 0
      });

      expect(result.status).toBe('completed');
      expect(result.winnerId).toBe(match.participant1Id);
    });

    it('should complete tournament after final match', async () => {
      await tournament.startTournament(tournamentId);

      // Play all matches
      let pendingMatches = await tournament.getMatches(tournamentId, { status: 'pending' });

      while (pendingMatches.length > 0) {
        for (const match of pendingMatches) {
          if (match.participant1Id && match.participant2Id) {
            await tournament.reportResult(match.id, {
              score1: 1,
              score2: 0
            });
          }
        }
        pendingMatches = await tournament.getMatches(tournamentId, { status: 'pending' });
      }

      const t = await tournament.get(tournamentId);
      expect(t.status).toBe('completed');
    });
  });

  describe('Round Robin Tournament', () => {
    let tournamentId;

    beforeEach(async () => {
      const t = await tournament.create({
        name: 'Round Robin Test',
        organizerId: 'org-rr',
        format: 'round-robin',
        participantType: 'team',
        config: {
          rounds: 1,
          bestOf: 1,
          pointsWin: 3,
          pointsDraw: 1,
          pointsLoss: 0
        }
      });
      tournamentId = t.id;

      await tournament.openRegistration(tournamentId);

      // Register 4 teams
      for (let i = 1; i <= 4; i++) {
        await tournament.register(tournamentId, `rr-team-${i}`);
        await tournament.confirmRegistration(tournamentId, `rr-team-${i}`);
      }
    });

    it('should start and create round robin schedule', async () => {
      await tournament.startTournament(tournamentId);

      const t = await tournament.get(tournamentId);
      expect(t.status).toBe('in-progress');

      const matches = await tournament.getMatches(tournamentId);
      // 4 teams = 6 matches in single round robin
      expect(matches.length).toBe(6);
    });

    it('should calculate standings correctly', async () => {
      await tournament.startTournament(tournamentId);

      const matches = await tournament.getMatches(tournamentId);

      // Team 1 wins all games
      for (const match of matches) {
        const score1 = match.participant1Id === 'rr-team-1' ? 2 : 0;
        const score2 = match.participant2Id === 'rr-team-1' ? 2 : (score1 === 2 ? 0 : 1);

        await tournament.reportResult(match.id, { score1, score2 });
      }

      const standings = await tournament.getStandings(tournamentId);
      expect(standings.length).toBe(4);
      expect(standings[0].participantId).toBe('rr-team-1');
      expect(standings[0].points).toBe(9); // 3 wins * 3 points
    });
  });

  describe('Swiss Format Tournament', () => {
    let tournamentId;

    beforeEach(async () => {
      const t = await tournament.create({
        name: 'Swiss Test',
        organizerId: 'org-swiss',
        format: 'swiss',
        participantType: 'team',
        config: {
          rounds: 3,
          bestOf: 1,
          advanceWins: 3,
          eliminateLosses: 3
        }
      });
      tournamentId = t.id;

      await tournament.openRegistration(tournamentId);

      // Register 8 teams
      for (let i = 1; i <= 8; i++) {
        await tournament.register(tournamentId, `swiss-team-${i}`);
        await tournament.confirmRegistration(tournamentId, `swiss-team-${i}`);
      }
    });

    it('should start with first round pairings', async () => {
      await tournament.startTournament(tournamentId);

      const t = await tournament.get(tournamentId);
      expect(t.status).toBe('in-progress');

      const matches = await tournament.getMatches(tournamentId);
      expect(matches.length).toBe(4); // 8 teams = 4 matches per round
    });
  });

  describe('Statistics', () => {
    it('should track plugin statistics', async () => {
      const stats = tournament.getStats();
      expect(stats).toHaveProperty('tournamentsCreated');
      expect(stats).toHaveProperty('matchesPlayed');
      expect(stats).toHaveProperty('registrations');
    });
  });
});
