import type { DuckDBConnection } from '@duckdb/node-api';

export type TelemetryPoint = {
  index: number;
  time: number;
  distance: number;
  speed: number;
  throttle: number;
  brake: number;
  lat: number | null;
  lon: number | null;
  lapIndex: number;
  engineRpm: number;
  steeringAngle: number;
};

type LapTimeRow = [number, number]; // [lapEndTime, lapTime]
type SectorRow = [number, number]; // [lapIndex, cumulativeSector]

export type LapSelectionResult = {
  lapIndex: number;
  lapStartTime: number;
  lapEndTime: number;
  lapDuration: number;
  sectors: { s1: number; s2: number; s3: number };
};

export async function loadTimingTables(connection: DuckDBConnection) {
  const lapTimesReader = await connection.runAndReadAll(
    `SELECT * FROM lmu_db."Lap Time"`
  );
  const lapTimeRows = lapTimesReader.getRows() as LapTimeRow[];
  if (!lapTimeRows.length) {
    throw new Error('Lap Time table is empty.');
  }

  const s1Reader = await connection.runAndReadAll(
    `SELECT * FROM lmu_db."Last Sector1"`
  );
  const s1Rows = s1Reader.getRows() as SectorRow[];
  if (!s1Rows.length) {
    throw new Error('Last Sector1 table is empty.');
  }

  const s2Reader = await connection.runAndReadAll(
    `SELECT * FROM lmu_db."Last Sector2"`
  );
  const s2Rows = s2Reader.getRows() as SectorRow[];
  if (!s2Rows.length) {
    throw new Error('Last Sector2 table is empty.');
  }

  return { lapTimeRows, s1Rows, s2Rows };
}

export function selectLap(
  lapTimeRows: LapTimeRow[],
  s1Rows: SectorRow[],
  s2Rows: SectorRow[],
  targetLapIndex: number | null
): LapSelectionResult {
  let lapIndex =
    targetLapIndex != null && Number.isFinite(targetLapIndex)
      ? targetLapIndex
      : -1;
  let bestLapTime = Infinity;

  if (lapIndex < 0 || lapIndex >= lapTimeRows.length) {
    for (let i = 0; i < lapTimeRows.length; i++) {
      const lt = Number(lapTimeRows[i][1]);
      if (lt > 0 && lt < bestLapTime) {
        bestLapTime = lt;
        lapIndex = i;
      }
    }
  }

  if (lapIndex < 0) {
    throw new Error('No valid lap found.');
  }

  const [lapEndRaw, lapTimeRaw] = lapTimeRows[lapIndex];
  const lapEnd = Number(lapEndRaw);
  const lapTime = Number(lapTimeRaw);

  const s1Cum = Number(s1Rows[lapIndex][1]);
  const s2Cum = Number(s2Rows[lapIndex][1]);
  const s1 = s1Cum;
  const s2 = s2Cum - s1Cum;
  const s3 = lapTime - s1 - s2;

  const firstLapStart = Number(lapTimeRows[0][0]);
  const lapDuration = lapTime;
  const lapStartTime = lapEnd - lapDuration - firstLapStart;
  const lapEndTime = lapStartTime + lapDuration;

  return {
    lapIndex,
    lapStartTime,
    lapEndTime,
    lapDuration,
    sectors: { s1, s2, s3 },
  };
}

export function computeIndexRanges(
  lapStartTime: number,
  lapEndTime: number,
  hz: {
    speed: number;
    dist: number;
    input: number;
    gps: number;
    rpm: number;
    steering: number;
  }
) {
  const startIdxSpeed = Math.max(0, Math.floor(lapStartTime * hz.speed));
  const endIdxSpeed = Math.max(
    startIdxSpeed + 1,
    Math.floor(lapEndTime * hz.speed)
  );

  const startIdxDist = Math.max(0, Math.floor(lapStartTime * hz.dist));
  const endIdxDist = Math.max(
    startIdxDist + 1,
    Math.floor(lapEndTime * hz.dist)
  );

  const startIdxInput = Math.max(0, Math.floor(lapStartTime * hz.input));
  const endIdxInput = Math.max(
    startIdxInput + 1,
    Math.floor(lapEndTime * hz.input)
  );

  const startIdxGps = Math.max(0, Math.floor(lapStartTime * hz.gps));
  const endIdxGps = Math.max(
    startIdxGps + 1,
    Math.floor(lapEndTime * hz.gps)
  );

  const startIdxRpm = Math.max(0, Math.floor(lapStartTime * hz.rpm));
  const endIdxRpm = Math.max(
    startIdxRpm + 1,
    Math.floor(lapEndTime * hz.rpm)
  );

  const startIdxSteering = Math.max(0, Math.floor(lapStartTime * hz.steering));
  const endIdxSteering = Math.max(
    startIdxSteering + 1,
    Math.floor(lapEndTime * hz.steering)
  );

  return {
    speed: { start: startIdxSpeed, end: endIdxSpeed },
    dist: { start: startIdxDist, end: endIdxDist },
    input: { start: startIdxInput, end: endIdxInput },
    gps: { start: startIdxGps, end: endIdxGps },
    rpm: { start: startIdxRpm, end: endIdxRpm },
    steering: { start: startIdxSteering, end: endIdxSteering },
  };
}

export async function loadTelemetrySlices(
  connection: DuckDBConnection,
  ranges: ReturnType<typeof computeIndexRanges>
) {
  const { speed, dist, input, gps, rpm, steering } = ranges;

  const speedReader = await connection.runAndReadAll(
    `SELECT value FROM lmu_db."Ground Speed" LIMIT ${speed.end - speed.start} OFFSET ${speed.start}`
  );
  const speedRows = speedReader.getRows();

  const distReader = await connection.runAndReadAll(
    `SELECT value FROM lmu_db."Lap Dist" LIMIT ${dist.end - dist.start} OFFSET ${dist.start}`
  );
  const distRows = distReader.getRows();

  const throttleReader = await connection.runAndReadAll(
    `SELECT value FROM lmu_db."Throttle Pos" LIMIT ${input.end - input.start} OFFSET ${input.start}`
  );
  const throttleRows = throttleReader.getRows();

  const brakeReader = await connection.runAndReadAll(
    `SELECT value FROM lmu_db."Brake Pos" LIMIT ${input.end - input.start} OFFSET ${input.start}`
  );
  const brakeRows = brakeReader.getRows();

  const latReader = await connection.runAndReadAll(
    `SELECT value FROM lmu_db."GPS Latitude" LIMIT ${gps.end - gps.start} OFFSET ${gps.start}`
  );
  const latRows = latReader.getRows();

  const lonReader = await connection.runAndReadAll(
    `SELECT value FROM lmu_db."GPS Longitude" LIMIT ${gps.end - gps.start} OFFSET ${gps.start}`
  );
  const lonRows = lonReader.getRows();

  const rpmReader = await connection.runAndReadAll(
    `SELECT value FROM lmu_db."Engine RPM" LIMIT ${rpm.end - rpm.start} OFFSET ${rpm.start}`
  );
  const rpmRows = rpmReader.getRows();

  const steeringReader = await connection.runAndReadAll(
    `SELECT value FROM lmu_db."Steering Pos" LIMIT ${steering.end - steering.start} OFFSET ${steering.start}`
  );
  const steeringRows = steeringReader.getRows();

  return {
    speedRows,
    distRows,
    throttleRows,
    brakeRows,
    latRows,
    lonRows,
    rpmRows,
    steeringRows,
  };
}

export function buildTelemetrySeries(
  lapIndex: number,
  ranges: ReturnType<typeof computeIndexRanges>,
  slices: Awaited<ReturnType<typeof loadTelemetrySlices>>,
  hz: {
    speed: number;
    dist: number;
    input: number;
    gps: number;
    rpm: number;
    steering: number;
  },
  sampleStep = 10
): TelemetryPoint[] {
  const {
    speedRows,
    distRows,
    throttleRows,
    brakeRows,
    latRows,
    lonRows,
    rpmRows,
    steeringRows,
  } = slices;

  const len = speedRows.length;
  const data: TelemetryPoint[] = [];

  for (let i = 0; i < len; i += sampleStep) {
    const tRel = i / hz.speed;

    const distIdx = Math.min(
      distRows.length - 1,
      Math.round(tRel * hz.dist)
    );
    const inputIdx = Math.min(
      throttleRows.length - 1,
      Math.round(tRel * hz.input)
    );
    const gpsIdx = Math.min(
      latRows.length - 1,
      Math.round(tRel * hz.gps)
    );

    const rawDist = Number(distRows[distIdx]?.[0] ?? 0);
    const distanceFromZero = rawDist;

    const lat = latRows.length
      ? Number(latRows[gpsIdx]?.[0] ?? null)
      : null;
    const lon = lonRows.length
      ? Number(lonRows[gpsIdx]?.[0] ?? null)
      : null;

    const engineRpm = Number(rpmRows[i]?.[0] ?? 0);
    const steeringAngle = Number(steeringRows[i]?.[0] ?? 0) * 100;

    data.push({
      index: i,
      time: tRel,
      distance: distanceFromZero,
      speed: Number(speedRows[i]?.[0] ?? 0),
      throttle: Number(throttleRows[inputIdx]?.[0] ?? 0),
      brake: Number(brakeRows[inputIdx]?.[0] ?? 0),
      lat,
      lon,
      lapIndex,
      engineRpm,
      steeringAngle,
    });
  }

  return data;
}
