import { NextRequest, NextResponse } from 'next/server';
import {
  saveTempDuckDbFile,
  openReadOnlyConnection,
  closeConnectionAndCleanup,
} from '@/lib/duckdbClient';
import {
  loadTimingTables,
  selectLap,
  computeIndexRanges,
  loadTelemetrySlices,
  buildTelemetrySeries,
} from '@/lib/telemetryService';

export async function POST(request: NextRequest) {
  let connection: any = null;
  let tempFile: string | null = null;

  try {
    console.log('🚀 LMU lap telemetry');

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const lapIndexRaw = formData.get('lapIndex') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'Missing file', data: [] },
        { status: 400 }
      );
    }

    const targetLapIndex =
      lapIndexRaw != null ? Number(lapIndexRaw) : (null as number | null);

    tempFile = await saveTempDuckDbFile(file);
    connection = await openReadOnlyConnection(tempFile);

    const { lapTimeRows, s1Rows, s2Rows } = await loadTimingTables(connection);
    const lapSelection = selectLap(
      lapTimeRows,
      s1Rows,
      s2Rows,
      targetLapIndex
    );

    const { lapIndex, lapStartTime, lapEndTime, lapDuration, sectors } =
      lapSelection;

    console.log('🥇 Selected lap:', {
      lapIndex,
      lapStartTime,
      lapEndTime,
      lapDuration,
      sectors,
    });

    // Hz from config.json: Engine RPM=100Hz, Steering Pos=100Hz
    const hz = {
      speed: 100,
      dist: 10,
      input: 50,
      gps: 10,
      rpm: 100,
      steering: 100,
      gear: 100,  // Same Hz as speed for Gear
    };


    const ranges = computeIndexRanges(lapStartTime, lapEndTime, hz);

    console.log('📏 Index ranges:', {
      speed: [ranges.speed.start, ranges.speed.end],
      dist: [ranges.dist.start, ranges.dist.end],
      input: [ranges.input.start, ranges.input.end],
      gps: [ranges.gps.start, ranges.gps.end],
      rpm: [ranges.rpm.start, ranges.rpm.end],
      steering: [ranges.steering.start, ranges.steering.end],
    });

    const slices = await loadTelemetrySlices(connection, ranges);

    console.log('📊 Slice lengths:', {
      speed: slices.speedRows.length,
      dist: slices.distRows.length,
      throttle: slices.throttleRows.length,
      brake: slices.brakeRows.length,
      lat: slices.latRows.length,
      lon: slices.lonRows.length,
      rpm: slices.rpmRows.length,
      steering: slices.steeringRows.length,
    });

    if (!slices.speedRows.length) {
      throw new Error('Ground Speed channel is empty.');
    }
    if (!slices.distRows.length) {
      throw new Error('Lap Dist channel is empty.');
    }

    const sampleStep = 10;
    const data = buildTelemetrySeries(
      lapIndex,
      ranges,
      slices,
      hz,
      sampleStep
    );

    console.log(
      '✅ Telemetry built. Original speed samples:',
      slices.speedRows.length,
      'Sampled points:',
      data.length
    );

    return NextResponse.json(
      {
        success: true,
        data,
        rowCount: data.length,
        lap: {
          index: lapIndex,
          lapEnd: Number(lapTimeRows[lapIndex][0]),
          lapStartTime,
          lapDuration,
          sectors,
          lapEndTime,
          speedIndexRange: [ranges.speed.start, ranges.speed.end],
        },
        hz,
        sampleStep,
        fileName: file.name,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('❌ /api/telemetry error:', err?.message);

    return NextResponse.json(
      {
        success: false,
        error: err?.message ?? 'Unknown error',
        data: [],
      },
      { status: 500 }
    );
  } finally {
    await closeConnectionAndCleanup(connection, tempFile);
  }
}
