export type StatLine = {
  playerId: string;
  name: string;
  jersey: number;
  order: number | null;
  pa: number;
  ab: number;
  r: number;
  h: number;
  singles: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  hbp: number;
  so: number;
  sb: number;
  cs: number;
  sf: number;
  sb: number;
  cs: number;
  sacrifices: number;
  pitchingOuts: number;
  earnedRuns: number;
  runsAllowed: number;
  walksAllowed: number;
  strikeoutsPitched: number;
  hitsAllowed: number;
  putouts: number;
  assists: number;
  fieldingErrors: number;
};

export type TeamBox = {
  rows: StatLine[];
  runs: number;
  hits: number;
  errors: number;
  lob: number;
  runsByInning: number[];
};

export type Player = {
  player_id: string;
  batting_order: number | null;
  first_name: string;
  last_name: string;
  jersey_number: number;
};

export type GameEvent = {
  result: string;
  details: Record<string, unknown> | null;
  voided_at: string | null;
  sequence: number;
  state_after?: Record<string, unknown> | null;
};

type Bases = {
  1: string | null;
  2: string | null;
  3: string | null;
};

const PA_RESULTS = new Set([
  "walk",
  "hbp",
  "single",
  "double",
  "triple",
  "home_run",
  "strikeout",
  "out",
  "error",
  "double_play",
  "triple_play",
  "sacrifice_fly",
  "sacrifice_bunt",
  "stolen_base",
  "caught_stealing",
]);

const HITS: Record<string, keyof StatLine> = {
  single: "singles",
  double: "doubles",
  triple: "triples",
  home_run: "hr",
};

function emptyStat(p: Player): StatLine {
  return {
    playerId: p.player_id,
    name: `${p.first_name} ${p.last_name}`.trim(),
    jersey: p.jersey_number,
    order: p.batting_order,
    pa: 0,
    ab: 0,
    r: 0,
    h: 0,
    singles: 0,
    doubles: 0,
    triples: 0,
    hr: 0,
    rbi: 0,
    bb: 0,
    hbp: 0,
    so: 0,
    sb: 0,
    cs: 0,
    sf: 0,
    sb: 0,
    cs: 0,
    sacrifices: 0,
    pitchingOuts: 0,
    earnedRuns: 0,
    runsAllowed: 0,
    walksAllowed: 0,
    strikeoutsPitched: 0,
    hitsAllowed: 0,
    putouts: 0,
    assists: 0,
    fieldingErrors: 0,
  };
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((v): v is string => typeof v === "string" && v.length > 0))];
}

function getBatterId(event: GameEvent) {
  const value = event.details?.batter_id;
  return typeof value === "string" ? value : null;
}

function isPlateAppearance(event: GameEvent) {
  if (typeof event.details?.plate_appearance === "boolean") {
    return event.details.plate_appearance;
  }
  return PA_RESULTS.has(event.result);
}

function advanceBases(result: string, batterId: string | null, bases: Bases) {
  const scored: string[] = [];
  const b1 = bases[1];
  const b2 = bases[2];
  const b3 = bases[3];

  if (result === "walk" || result === "hbp") {
    if (b1 && b2 && b3) scored.push(b3);
    return {
      scored,
      bases: {
        1: batterId,
        2: b1,
        3: b1 && b2 ? b2 : b3,
      } satisfies Bases,
    };
  }

  if (result === "single" || result === "error") {
    if (b3) scored.push(b3);
    return {
      scored,
      bases: { 1: batterId, 2: b1, 3: b2 } satisfies Bases,
    };
  }

  if (result === "double") {
    if (b3) scored.push(b3);
    if (b2) scored.push(b2);
    return {
      scored,
      bases: { 1: null, 2: batterId, 3: b1 } satisfies Bases,
    };
  }

  if (result === "triple") {
    if (b1) scored.push(b1);
    if (b2) scored.push(b2);
    if (b3) scored.push(b3);
    return {
      scored,
      bases: { 1: null, 2: null, 3: batterId } satisfies Bases,
    };
  }

  if (result === "home_run") {
    if (batterId) scored.push(batterId);
    if (b1) scored.push(b1);
    if (b2) scored.push(b2);
    if (b3) scored.push(b3);
    return {
      scored,
      bases: { 1: null, 2: null, 3: null } satisfies Bases,
    };
  }

  return { scored, bases };
}

function addRun(team: TeamBox, playerStats: Map<string, StatLine>, runnerId: string) {
  team.runs++;
  const stat = playerStats.get(runnerId);
  if (stat) stat.r++;
}

function newTeam(players: Player[]): TeamBox & { stats: Map<string, StatLine> } {
  const stats = new Map<string, StatLine>();
  for (const p of players) stats.set(p.player_id, emptyStat(p));
  return { rows: [], runs: 0, hits: 0, errors: 0, lob: 0, runsByInning: [], stats };
}

export function calculateGameStats(
  homePlayers: Player[],
  awayPlayers: Player[],
  events: GameEvent[],
): { home: TeamBox; away: TeamBox } {
  const home = newTeam(homePlayers);
  const away = newTeam(awayPlayers);
  const playerTeam = new Map<string, "home" | "away">();
  for (const p of homePlayers) playerTeam.set(p.player_id, "home");
  for (const p of awayPlayers) playerTeam.set(p.player_id, "away");

  let bases: Bases = { 1: null, 2: null, 3: null };
  let outs = 0;
  let inning = 1;
  let half: "top" | "bottom" = "top";
  const ordered = events.filter((e) => !e.voided_at).sort((a, b) => a.sequence - b.sequence);

  for (const event of ordered) {
    const batterId = getBatterId(event);
    const battingTeamName = batterId ? playerTeam.get(batterId) : undefined;
    const batting = battingTeamName === "home" ? home : battingTeamName === "away" ? away : null;
    const fielding = batting === home ? away : batting === away ? home : null;

    while ((home.runsByInning.length < inning)) home.runsByInning.push(0);
    while ((away.runsByInning.length < inning)) away.runsByInning.push(0);

    // Runner actions are first-class scoring events, not plate appearances.
    // Attribute a runner's run to the runner, and update the reconstructed bases
    // before processing the next event. This keeps LOB and inning runs consistent
    // when the scorekeeper manually advances, scores, or retires a runner.
    if (
      event.result === "runner_advance" ||
      event.result === "runner_score" ||
      event.result === "runner_out"
    ) {
      const details = event.details ?? {};
      const runnerId = typeof details.runner_id === "string" ? details.runner_id : null;
      const runnerTeamName = runnerId ? playerTeam.get(runnerId) : undefined;
      const runnerTeam = runnerTeamName === "home" ? home
        : runnerTeamName === "away" ? away
        : half === "top" ? away : home;
      const runnerStats = runnerTeam.stats;
      const baseFrom = details.base_from === "1" || details.base_from === "2" || details.base_from === "3"
        ? details.base_from : null;
      const baseTo = details.base_to === "1" || details.base_to === "2" || details.base_to === "3"
        ? details.base_to : null;

      if (event.result === "runner_advance" && baseFrom && baseTo) {
        const movedRunner = bases[Number(baseFrom) as 1 | 2 | 3] ?? runnerId;
        bases[Number(baseFrom) as 1 | 2 | 3] = null;
        bases[Number(baseTo) as 1 | 2 | 3] = movedRunner;
      } else if ((event.result === "runner_score" || event.result === "runner_out") && baseFrom) {
        const movedRunner = bases[Number(baseFrom) as 1 | 2 | 3] ?? runnerId;
        bases[Number(baseFrom) as 1 | 2 | 3] = null;
        if (event.result === "runner_score" && movedRunner) {
          addRun(runnerTeam, runnerStats, movedRunner);
          while (runnerTeam.runsByInning.length < inning) runnerTeam.runsByInning.push(0);
          runnerTeam.runsByInning[inning - 1]++;
        } else if (event.result === "runner_out") {
          outs++;
          if (pitcher && ["strikeout", "out", "sacrifice_fly", "sacrifice_bunt"].includes(event.result)) pitcher.pitchingOuts++;

    if (outs >= 3) {
            runnerTeam.lob += [bases[1], bases[2], bases[3]].filter(Boolean).length;
            bases = { 1: null, 2: null, 3: null };
            outs = 0;
            if (half === "top") half = "bottom";
            else {
              half = "top";
              inning++;
            }
          }
        }
      }
      while (home.runsByInning.length < inning) home.runsByInning.push(0);
      while (away.runsByInning.length < inning) away.runsByInning.push(0);
      continue;
    }

    const details = event.details ?? {};
    const pitcherId = typeof details.pitcher_id === "string" ? details.pitcher_id : null;
    const pitcherTeamName = pitcherId ? playerTeam.get(pitcherId) : undefined;
    const pitchingTeam = pitcherTeamName === "home" ? home : pitcherTeamName === "away" ? away : null;
    const pitcher = pitcherId && pitchingTeam ? pitchingTeam.stats.get(pitcherId) : undefined;
    const defensePlayers = batting === home ? away : batting === away ? home : null;
    if (event.result === "error" && fielding) fielding.errors++;
    if (event.result === "error") {
      const position = typeof details.error_position === "string" ? details.error_position : null;
      const fielderId = typeof details.error_fielder_id === "string" ? details.error_fielder_id : null;
      if (fielderId && defensePlayers) defensePlayers.stats.get(fielderId)!.fieldingErrors++;
    }
    if (pitcher) {
      if (event.result === "walk") pitcher.walksAllowed++;
      if (event.result === "strikeout") pitcher.strikeoutsPitched++;
      if (["single", "double", "triple", "home_run"].includes(event.result)) pitcher.hitsAllowed++;
      if (event.result === "runner_score" || ["single", "double", "triple", "home_run", "walk", "hbp", "error"].includes(event.result)) {
        const runsAllowed = Number(details.runs_scored ?? (event.result === "runner_score" ? 1 : 0));
        if (Number.isFinite(runsAllowed) && runsAllowed > 0) pitcher.runsAllowed += runsAllowed;
        const earned = Number(details.earned_runs ?? 0);
        if (Number.isFinite(earned) && earned > 0) pitcher.earnedRuns += earned;
      }
    }
    if (event.result === "stolen_base" && batterId && batting) batting.stats.get(batterId)!.sb++;
    if (event.result === "caught_stealing" && batterId && batting) batting.stats.get(batterId)!.cs++;
    if (event.result === "sacrifice_fly" && batterId && batting) {
      const stat = batting.stats.get(batterId);
      if (stat) { stat.pa++; stat.sf++; }
    }
    if (event.result === "sacrifice_bunt" && batterId && batting) {
      const stat = batting.stats.get(batterId);
      if (stat) { stat.pa++; stat.sacrifices++; }
    }
    if (["out", "strikeout", "double_play", "triple_play"].includes(event.result) && defensePlayers) {
      const outCount = event.result === "double_play" ? 2 : event.result === "triple_play" ? 3 : 1;
      const positions = [details.out_position_1, details.out_position_2, details.out_position_3].filter((v): v is string => typeof v === "string");
      const ids = [details.out_fielder_id_1, details.out_fielder_id_2, details.out_fielder_id_3].filter((v): v is string => typeof v === "string");
      ids.slice(0, outCount).forEach((id, index) => {
        const fielder = defensePlayers.stats.get(id);
        if (fielder) { if (index === outCount - 1) fielder.putouts++; else fielder.assists++; }
      });
    }

    if (isPlateAppearance(event) && batterId && batting) {
      const stat = batting.stats.get(batterId);
      if (stat) {
        stat.pa++;
        if (event.result === "walk") stat.bb++;
        else if (event.result === "hbp") stat.hbp++;
        else if (event.result === "sacrifice_fly" || event.result === "sacrifice_bunt") {
          // Sacrifice plays count as PA but not AB.
        } else {
          stat.ab++;
          if (event.result === "strikeout") stat.so++;
          const hitKey = HITS[event.result];
          if (hitKey) {
            stat.h++;
            stat[hitKey]++;
            batting.hits++;
          }
        }

      }
    }

    const movement = advanceBases(event.result, batterId, bases);
    if (
      batting &&
      batterId &&
      ["walk", "hbp", "single", "double", "triple", "home_run"].includes(event.result)
    ) {
      const batterStat = batting.stats.get(batterId);
      if (batterStat) {
        // Prefer an explicitly scored RBI total when the event supplies one.
        // Otherwise infer RBIs from runners crossing home on this scoring outcome.
        const explicitRbi = event.details?.rbi;
        batterStat.rbi += typeof explicitRbi === "number"
          ? Math.max(0, explicitRbi)
          : uniqueStrings(movement.scored).length;
      }
    }
    for (const runnerId of uniqueStrings(movement.scored)) {
      if (batting) {
        addRun(batting, batting.stats, runnerId);
        while (batting.runsByInning.length < inning) batting.runsByInning.push(0);
        batting.runsByInning[inning - 1]++;
      }
    }
    bases = movement.bases;

    if (event.result === "strikeout" || event.result === "out" || event.result === "sacrifice_fly" || event.result === "sacrifice_bunt") outs += 1;
    else if (event.result === "double_play") outs += 2;
    else if (event.result === "triple_play") outs += 3;

    if (outs >= 3) {
      const lobCount = [bases[1], bases[2], bases[3]].filter(Boolean).length;
      if (batting) batting.lob += lobCount;
      bases = { 1: null, 2: null, 3: null };
      outs = 0;
      if (half === "top") half = "bottom";
      else {
        half = "top";
        inning++;
      }
    }
  }

  home.rows = [...home.stats.values()];
  away.rows = [...away.stats.values()];
  return { home, away };
}

export function rate(numerator: number, denominator: number) {
  return denominator ? (numerator / denominator).toFixed(3).replace(/^0/, "") : ".000";
}

export function obp(stat: StatLine) {
  return rate(stat.h + stat.bb + stat.hbp, stat.ab + stat.bb + stat.hbp + stat.sf);
}

export function slg(stat: StatLine) {
  return rate(
    stat.singles + 2 * stat.doubles + 3 * stat.triples + 4 * stat.hr,
    stat.ab,
  );
}

export function ops(stat: StatLine) {
  return (Number(obp(stat)) + Number(slg(stat))).toFixed(3).replace(/^0/, "");
}
