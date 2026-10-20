import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuditRecord, Market, ModelPerformance, Pick } from "@workspace/api-zod";
import { firstBasketProvider } from "./firstBasket";
import { picksProvider } from "./picks";
import { resultsProvider, type GameResult, type PlayerStatLine } from "./results";

const STORE_PATH =
  process.env.AUDIT_STORE_PATH ?? path.resolve(process.cwd(), ".data", "audit.json");
const MAX_RECORDS = 1000;

type Store = { version: 1; records: AuditRecord[] };

let records: AuditRecord[] | null = null;
let chain: Promise<unknown> = Promise.resolve();

function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function load(): Promise<AuditRecord[]> {
  if (records) return records;
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Store;
    records = Array.isArray(parsed?.records) ? parsed.records : [];
  } catch {
    records = [];
  }
  return records;
}

async function save(next: AuditRecord[]): Promise<void> {
  try {
    await mkdir(path.dirname(STORE_PATH), { recursive: true });
    const temporary = `${STORE_PATH}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: 1, records: next } satisfies Store), "utf8");
    await rename(temporary, STORE_PATH);
  } catch (error) {
    // A read-only or ephemeral filesystem should not break the audit page; the
    // in-memory ledger still serves this process.
    console.error("[audit] could not persist ledger:", error instanceof Error ? error.message : error);
  }
}

function gameIdFromPick(pick: Pick): string {
  const [gameId] = pick.id.split("-");
  return gameId || "unknown";
}

function pickRecord(pick: Pick): AuditRecord {
  return {
    id: pick.id,
    gameId: gameIdFromPick(pick),
    playerId: pick.playerId,
    playerName: pick.playerName,
    team: pick.team,
    market: pick.market,
    line: pick.line,
    projection: pick.projection,
    probability: pick.overProbability,
    odds: pick.overOdds,
    confidence: pick.confidence,
    modelVersion: picksProvider.modelVersion,
    dataInputs: pick.rationale,
    adjustments: [
      "Recency-weighted form blended with the latest season baseline",
      "Over probability compared with the de-vigged market price",
    ],
    recordedAt: new Date(),
    status: "pending",
    actual: null,
    actualScorer: null,
    settledAt: null,
  };
}

function firstBasketRecord(entry: Awaited<ReturnType<typeof firstBasketProvider.getEntries>>[number]): AuditRecord {
  return {
    id: entry.id,
    gameId: entry.gameId,
    playerId: entry.playerId,
    playerName: entry.playerName,
    team: entry.team,
    market: "first_basket",
    line: null,
    projection: entry.projectedPoints,
    probability: entry.probability,
    odds: null,
    confidence: entry.confidence,
    modelVersion: firstBasketProvider.modelVersion,
    dataInputs: entry.rationale,
    adjustments: [
      "Team scoring allocated by projected player points",
      "Settles on the first made field goal; free throws do not count",
    ],
    recordedAt: new Date(),
    status: "pending",
    actual: null,
    actualScorer: null,
    settledAt: null,
  };
}

/**
 * Applies one final ESPN result to a pending record. Exported so the grading
 * rules can be exercised without hitting DunkAPI.
 */
export function settleRecord(record: AuditRecord, result: GameResult): boolean {
  if (record.status !== "pending" || result.status !== "final") return false;

  if (record.market === "first_basket") {
    if (!result.firstBasket) return false;
    const won = result.firstBasket.playerId === record.playerId;
    record.status = won ? "won" : "lost";
    record.actual = won ? 1 : 0;
    record.actualScorer = result.firstBasket.playerName;
    record.settledAt = new Date();
    return true;
  }

  const line = result.playerStats.get(record.playerId ?? "");
  if (!line || record.line === null) return false;
  const actual = statFor(record.market, line);
  if (actual === null) return false;
  record.actual = actual;
  record.status = actual > record.line ? "won" : actual === record.line ? "push" : "lost";
  record.settledAt = new Date();
  return true;
}

function statFor(market: Market, line: PlayerStatLine): number | null {
  switch (market) {
    case "points":
      return line.points;
    case "rebounds":
      return line.rebounds;
    case "assists":
      return line.assists;
    case "threes":
      return line.threes;
    default:
      return null;
  }
}

async function collect(): Promise<AuditRecord[]> {
  const ledger = await load();
  const existing = new Map(ledger.map((record) => [record.id, record]));
  let changed = false;

  const [picks, firstBasket] = await Promise.all([
    picksProvider.getPicks().catch((error) => {
      console.error("[audit] picks unavailable:", error instanceof Error ? error.message : error);
      return [] as Pick[];
    }),
    firstBasketProvider.getEntries().catch((error) => {
      console.error("[audit] first-basket unavailable:", error instanceof Error ? error.message : error);
      return [];
    }),
  ]);

  const add = (record: AuditRecord) => {
    if (existing.has(record.id)) return;
    existing.set(record.id, record);
    changed = true;
  };

  picks.forEach((pick) => add(pickRecord(pick)));
  firstBasket.forEach((entry) => add(firstBasketRecord(entry)));

  const pending = [...existing.values()].filter((record) => record.status === "pending");
  const gameIds = [...new Set(pending.map((record) => record.gameId))];
  const results = new Map<string, Awaited<ReturnType<typeof resultsProvider.getGameResult>>>();

  for (const gameId of gameIds) {
    if (!gameId || gameId === "unknown") continue;
    results.set(gameId, await resultsProvider.getGameResult(gameId));
  }

  pending.forEach((record) => {
    const result = results.get(record.gameId);
    if (result && settleRecord(record, result)) changed = true;
  });

  const next = [...existing.values()]
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
    .slice(0, MAX_RECORDS);
  records = next;

  if (changed) await save(next);
  return next;
}

function performanceFor(ledger: AuditRecord[]): ModelPerformance[] {
  const groups = new Map<Market, AuditRecord[]>();
  ledger
    .filter((record) => record.status !== "pending")
    .forEach((record) => {
      const list = groups.get(record.market) ?? [];
      list.push(record);
      groups.set(record.market, list);
    });

  return [...groups.entries()]
    .map(([market, settled]) => {
      const wins = settled.filter((record) => record.status === "won").length;
      const losses = settled.filter((record) => record.status === "lost").length;
      const decided = wins + losses;
      const errors = settled
        .map((record) => {
          if (market === "first_basket") {
            const outcome = record.status === "won" ? 1 : 0;
            return Math.abs(record.probability - outcome);
          }
          const actual = record.actual;
          return actual === null || record.line === null ? null : Math.abs(actual - record.line);
        })
        .filter((value): value is number => value !== null);

      return {
        market,
        sampleSize: settled.length,
        hitRate: decided > 0 ? Number((wins / decided).toFixed(4)) : null,
        averageError:
          errors.length > 0
            ? Number((errors.reduce((total, value) => total + value, 0) / errors.length).toFixed(4))
            : null,
        roi: null,
        status: "tracking" as const,
      };
    })
    .sort((a, b) => b.sampleSize - a.sampleSize);
}

export const auditProvider = {
  getAudit: async (): Promise<AuditRecord[]> => serial(collect),

  getPerformance: async (): Promise<ModelPerformance[]> => {
    const ledger = await serial(collect);
    return performanceFor(ledger);
  },

  reset: (): void => {
    records = null;
  },
};
