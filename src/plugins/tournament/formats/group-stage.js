/**
 * Group Stage Format
 * Supports Round Robin groups and GSL (Dual Tournament) style
 */
import { BaseFormat } from './base-format.js';
import { generateRoundRobinSchedule, generateGSLBracket } from '../bracket-generator.js';
import { calculateRoundRobinStandings } from '../standings-calculator.js';
import { snakeSeeding } from '../seeding-strategies.js';

export class GroupStageFormat extends BaseFormat {
  static get type() {
    return 'group-stage';
  }

  static get displayName() {
    return 'Group Stage (Fase de Grupos)';
  }

  static get defaultConfig() {
    return {
      groupCount: 4,
      participantsPerGroup: 4,
      style: 'round-robin',  // 'round-robin' or 'gsl'
      rounds: 1,             // For round-robin: 1 or 2 turns
      bestOf: 1,
      advanceCount: 2,       // How many advance from each group
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      seedingStrategy: 'snake' // 'snake', 'random', 'sequential'
    };
  }

  validate(participants, config) {
    const errors = [];

    if (!participants || participants.length < 4) {
      errors.push('Minimum 4 participants required for group stage');
    }

    const groupCount = config.groupCount || 4;
    const perGroup = config.participantsPerGroup || 4;

    if (participants.length < groupCount * 2) {
      errors.push(`Not enough participants for ${groupCount} groups`);
    }

    if (config.style === 'gsl' && perGroup !== 4) {
      errors.push('GSL format requires exactly 4 participants per group');
    }

    if (config.advanceCount >= perGroup) {
      errors.push('Advance count must be less than participants per group');
    }

    return { valid: errors.length === 0, errors };
  }

  generateBracket(participants, config) {
    const groupCount = config.groupCount || 4;
    const perGroup = config.participantsPerGroup || Math.ceil(participants.length / groupCount);

    // Distribute participants into groups
    let groups;
    if (config.seedingStrategy === 'snake') {
      groups = snakeSeeding(participants, groupCount);
    } else if (config.seedingStrategy === 'random') {
      const shuffled = [...participants].sort(() => Math.random() - 0.5);
      groups = this._distributeSequential(shuffled, groupCount);
    } else {
      groups = this._distributeSequential(participants, groupCount);
    }

    // Generate brackets for each group
    const groupBrackets = groups.map((groupParticipants, index) => {
      const groupId = String.fromCharCode(65 + index); // A, B, C, D...

      if (config.style === 'gsl') {
        return {
          groupId,
          style: 'gsl',
          participants: groupParticipants,
          bracket: generateGSLBracket(groupParticipants, { bestOf: config.bestOf }),
          advancing: [],
          eliminated: [],
          complete: false
        };
      } else {
        return {
          groupId,
          style: 'round-robin',
          participants: groupParticipants,
          schedule: generateRoundRobinSchedule(groupParticipants, {
            rounds: config.rounds || 1,
            bestOf: config.bestOf
          }),
          standings: [],
          complete: false
        };
      }
    });

    return {
      type: 'group-stage',
      style: config.style || 'round-robin',
      config: { ...this.config, ...config },
      groups: groupBrackets,
      advanceCount: config.advanceCount || 2,
      advancing: [], // All advancing participants
      currentGroup: 0
    };
  }

  _distributeSequential(participants, groupCount) {
    const groups = Array.from({ length: groupCount }, () => []);

    for (let i = 0; i < participants.length; i++) {
      groups[i % groupCount].push(participants[i]);
    }

    return groups;
  }

  getInitialMatches(bracket) {
    const matches = [];

    for (const group of bracket.groups) {
      if (group.style === 'gsl') {
        // GSL: return opening matches
        const openingMatches = group.bracket.matches.filter(m => m.type === 'opening');
        for (const match of openingMatches) {
          matches.push({
            ...this.createMatchTemplate({
              phase: 'groups',
              round: 1,
              matchNumber: matches.length + 1,
              participant1Id: match.participant1Id,
              participant2Id: match.participant2Id,
              bestOf: match.bestOf,
              groupId: group.groupId
            }),
            id: `G${group.groupId}_${match.id}`
          });
        }
      } else {
        // Round Robin: return first round matches
        if (group.schedule.matches.length > 0) {
          for (const match of group.schedule.matches[0]) {
            matches.push({
              ...this.createMatchTemplate({
                phase: 'groups',
                round: match.round,
                matchNumber: match.matchNumber,
                participant1Id: match.participant1Id,
                participant2Id: match.participant2Id,
                bestOf: match.bestOf,
                groupId: group.groupId
              }),
              id: `G${group.groupId}_${match.id}`
            });
          }
        }
      }
    }

    return matches;
  }

  onMatchComplete(bracket, completedMatch) {
    const newMatches = [];
    const groupId = completedMatch.groupId;
    const group = bracket.groups.find(g => g.groupId === groupId);

    if (!group) return { bracket, newMatches };

    if (group.style === 'gsl') {
      this._processGSLMatch(bracket, group, completedMatch, newMatches);
    } else {
      this._processRoundRobinMatch(bracket, group, completedMatch, newMatches);
    }

    // Check if all groups are complete
    if (bracket.groups.every(g => g.complete)) {
      // Collect all advancing participants
      bracket.advancing = bracket.groups.flatMap(g => g.advancing || []);
    }

    return { bracket, newMatches };
  }

  _processGSLMatch(bracket, group, match, newMatches) {
    const gslMatch = group.bracket.matches.find(m =>
      `G${group.groupId}_${m.id}` === match.id || m.id === match.id.replace(`G${group.groupId}_`, '')
    );

    if (!gslMatch) return;

    gslMatch.winnerId = match.winnerId;
    gslMatch.loserId = match.loserId;
    gslMatch.status = 'completed';

    // Process GSL flow
    if (gslMatch.type === 'opening') {
      // Winner goes to winners match, loser to losers match
      const winnersMatch = group.bracket.matches.find(m => m.id === 'WM');
      const losersMatch = group.bracket.matches.find(m => m.id === 'LM');

      if (gslMatch.winnerNextMatch === 'WM') {
        if (!winnersMatch.participant1Id) {
          winnersMatch.participant1Id = match.winnerId;
        } else {
          winnersMatch.participant2Id = match.winnerId;
        }
      }

      if (gslMatch.loserNextMatch === 'LM') {
        if (!losersMatch.participant1Id) {
          losersMatch.participant1Id = match.loserId;
        } else {
          losersMatch.participant2Id = match.loserId;
        }
      }

      // Check if winners/losers matches are ready
      if (winnersMatch.participant1Id && winnersMatch.participant2Id && winnersMatch.status === 'pending') {
        newMatches.push({
          ...this.createMatchTemplate({
            phase: 'groups',
            round: 2,
            matchNumber: 1,
            participant1Id: winnersMatch.participant1Id,
            participant2Id: winnersMatch.participant2Id,
            bestOf: winnersMatch.bestOf,
            groupId: group.groupId
          }),
          id: `G${group.groupId}_WM`
        });
      }

      if (losersMatch.participant1Id && losersMatch.participant2Id && losersMatch.status === 'pending') {
        newMatches.push({
          ...this.createMatchTemplate({
            phase: 'groups',
            round: 2,
            matchNumber: 2,
            participant1Id: losersMatch.participant1Id,
            participant2Id: losersMatch.participant2Id,
            bestOf: losersMatch.bestOf,
            groupId: group.groupId
          }),
          id: `G${group.groupId}_LM`
        });
      }
    } else if (gslMatch.type === 'winners') {
      // Winner advances as 1st seed
      group.advancing = group.advancing || [];
      group.advancing.push({ participantId: match.winnerId, seed: 1 });

      // Loser goes to decider
      const deciderMatch = group.bracket.matches.find(m => m.id === 'DM');
      deciderMatch.participant1Id = match.loserId;

      // Check if decider is ready
      if (deciderMatch.participant1Id && deciderMatch.participant2Id && deciderMatch.status === 'pending') {
        newMatches.push({
          ...this.createMatchTemplate({
            phase: 'groups',
            round: 3,
            matchNumber: 1,
            participant1Id: deciderMatch.participant1Id,
            participant2Id: deciderMatch.participant2Id,
            bestOf: deciderMatch.bestOf,
            groupId: group.groupId
          }),
          id: `G${group.groupId}_DM`
        });
      }
    } else if (gslMatch.type === 'losers') {
      // Loser is eliminated
      group.eliminated = group.eliminated || [];
      group.eliminated.push(match.loserId);

      // Winner goes to decider
      const deciderMatch = group.bracket.matches.find(m => m.id === 'DM');
      deciderMatch.participant2Id = match.winnerId;

      // Check if decider is ready
      if (deciderMatch.participant1Id && deciderMatch.participant2Id && deciderMatch.status === 'pending') {
        newMatches.push({
          ...this.createMatchTemplate({
            phase: 'groups',
            round: 3,
            matchNumber: 1,
            participant1Id: deciderMatch.participant1Id,
            participant2Id: deciderMatch.participant2Id,
            bestOf: deciderMatch.bestOf,
            groupId: group.groupId
          }),
          id: `G${group.groupId}_DM`
        });
      }
    } else if (gslMatch.type === 'decider') {
      // Winner advances as 2nd seed, loser eliminated
      group.advancing = group.advancing || [];
      group.advancing.push({ participantId: match.winnerId, seed: 2 });
      group.eliminated = group.eliminated || [];
      group.eliminated.push(match.loserId);
      group.complete = true;
    }
  }

  _processRoundRobinMatch(bracket, group, match, newMatches) {
    // Check if current round is complete
    const allMatches = group.schedule.matches.flat();
    const matchIndex = allMatches.findIndex(m => `G${group.groupId}_${m.id}` === match.id);

    if (matchIndex >= 0) {
      allMatches[matchIndex].status = 'completed';
      allMatches[matchIndex].winnerId = match.winnerId;
    }

    // Find which round we're in
    let currentRoundIndex = 0;
    for (let i = 0; i < group.schedule.matches.length; i++) {
      const roundComplete = group.schedule.matches[i].every(m => m.status === 'completed');
      if (roundComplete) {
        currentRoundIndex = i + 1;
      } else {
        break;
      }
    }

    // If round complete, generate next round
    if (currentRoundIndex < group.schedule.matches.length) {
      const nextRound = group.schedule.matches[currentRoundIndex];
      const pendingInNextRound = nextRound.filter(m => m.status !== 'completed');

      for (const nextMatch of pendingInNextRound) {
        if (!newMatches.some(nm => nm.id === `G${group.groupId}_${nextMatch.id}`)) {
          newMatches.push({
            ...this.createMatchTemplate({
              phase: 'groups',
              round: nextMatch.round,
              matchNumber: nextMatch.matchNumber,
              participant1Id: nextMatch.participant1Id,
              participant2Id: nextMatch.participant2Id,
              bestOf: nextMatch.bestOf,
              groupId: group.groupId
            }),
            id: `G${group.groupId}_${nextMatch.id}`
          });
        }
      }
    }

    // Check if group is complete
    const allComplete = allMatches.every(m => m.status === 'completed');
    if (allComplete) {
      group.complete = true;

      // Calculate standings and determine who advances
      const standings = calculateRoundRobinStandings(group.participants, allMatches, bracket.config);
      group.standings = standings;
      group.advancing = standings.slice(0, bracket.advanceCount).map((s, i) => ({
        participantId: s.participantId,
        seed: i + 1
      }));
      group.eliminated = standings.slice(bracket.advanceCount).map(s => s.participantId);
    }
  }

  getStandings(bracket, matches) {
    const allStandings = [];

    for (const group of bracket.groups) {
      if (group.style === 'round-robin') {
        const groupMatches = matches.filter(m => m.groupId === group.groupId);
        const standings = calculateRoundRobinStandings(group.participants, groupMatches, bracket.config);

        for (const s of standings) {
          allStandings.push({ ...s, groupId: group.groupId });
        }
      } else if (group.style === 'gsl') {
        // GSL standings based on advancement
        for (const adv of group.advancing || []) {
          allStandings.push({
            participantId: adv.participantId,
            groupId: group.groupId,
            seed: adv.seed,
            status: 'advanced'
          });
        }
        for (const elim of group.eliminated || []) {
          allStandings.push({
            participantId: elim,
            groupId: group.groupId,
            status: 'eliminated'
          });
        }
      }
    }

    return allStandings;
  }

  isComplete(bracket, matches) {
    return bracket.groups.every(g => g.complete);
  }

  getWinner(bracket, matches) {
    // Group stage doesn't have a single winner
    return null;
  }

  getAdvancing(bracket) {
    return bracket.advancing;
  }

  getCurrentPhase(bracket, matches) {
    return 'groups';
  }

  getCurrentRound(bracket, matches) {
    // Return the minimum incomplete round across all groups
    let minRound = Infinity;

    for (const group of bracket.groups) {
      if (!group.complete) {
        if (group.style === 'round-robin') {
          for (let i = 0; i < group.schedule.matches.length; i++) {
            const roundComplete = group.schedule.matches[i].every(m => m.status === 'completed');
            if (!roundComplete) {
              minRound = Math.min(minRound, i + 1);
              break;
            }
          }
        }
      }
    }

    return minRound === Infinity ? 1 : minRound;
  }
}
