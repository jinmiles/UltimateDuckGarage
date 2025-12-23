// Logic for building LMU lap summary list from DuckDB.

import type { DuckDBConnection } from '@duckdb/node-api';

export type LapSummary = {
  lapIndex: number; // 0-based
  lapTime: number;
  sectors: { s1: number; s2: number; s3: number };
};

export type LapsResult = {
  laps: LapSummary[];
  bestLapIndex: number;
  bestSectors: { s1: number; s2: number; s3: number };
};

/**
 * Load Lap Time / Last Sector1 / Last Sector2 tables.
 */
export async function loadLapTables(connection: DuckDBConnection) {
  const lapTimesRes = await connection.runAndReadAll(
    `SELECT * FROM lmu_db."Lap Time"`
  );
  const lapTimeRows = lapTimesRes.getRows();

  const s1Res = await connection.runAndReadAll(
    `SELECT * FROM lmu_db."Last Sector1"`
  );
  const s1Rows = s1Res.getRows();

  const s2Res = await connection.runAndReadAll(
    `SELECT * FROM lmu_db."Last Sector2"`
  );
  const s2Rows = s2Res.getRows();

  if (!lapTimeRows.length) {
    throw new Error('Lap Time table is empty.');
  }
  if (!s1Rows.length) {
    throw new Error('Last Sector1 table is empty.');
  }
  if (!s2Rows.length) {
    throw new Error('Last Sector2 table is empty.');
  }

  return { lapTimeRows, s1Rows, s2Rows };
}

/**
 * Build lap summaries, best lap index and best sector times.
 */
export function buildLapSummaries(
  lapTimeRows: any[][],
  s1Rows: any[][],
  s2Rows: any[][]
): LapsResult {
  const laps: LapSummary[] = [];

  let bestLapIndex = -1;
  let bestLapTime = Infinity;

  let bestS1 = Infinity;
  let bestS2 = Infinity;
  let bestS3 = Infinity;

  for (let i = 0; i < lapTimeRows.length; i++) {
    const lapTime = Number(lapTimeRows[i][1]);
    if (lapTime <= 0 || !Number.isFinite(lapTime)) continue;

    const s1Cum = Number(s1Rows[i]?.[1] ?? 0);
    const s2Cum = Number(s2Rows[i]?.[1] ?? 0);
    const s1 = s1Cum;
    const s2 = s2Cum - s1Cum;
    const s3 = lapTime - s1 - s2;

    if (lapTime < bestLapTime) {
      bestLapTime = lapTime;
      bestLapIndex = i;
    }

    if (s1 > 0 && s1 < bestS1) bestS1 = s1;
    if (s2 > 0 && s2 < bestS2) bestS2 = s2;
    if (s3 > 0 && s3 < bestS3) bestS3 = s3;

    laps.push({
      lapIndex: i,
      lapTime,
      sectors: { s1, s2, s3 },
    });
  }

  return {
    laps,
    bestLapIndex,
    bestSectors: { s1: bestS1, s2: bestS2, s3: bestS3 },
  };
}
