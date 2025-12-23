import { NextRequest, NextResponse } from 'next/server';
import {
  saveTempDuckDbFile,
  openReadOnlyConnection,
  closeConnectionAndCleanup,
} from '@/lib/duckdbClient';
import {
  loadLapTables,
  buildLapSummaries,
} from '@/lib/lapsService';

export async function POST(request: NextRequest) {
  let connection: any = null;
  let tempFile: string | null = null;

  try {
    console.log('🚀 LMU lap list generation');

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'Missing file', laps: [] },
        { status: 400 }
      );
    }

    // 1) Save uploaded DuckDB file to temp path and attach as lmu_db.
    tempFile = await saveTempDuckDbFile(file);
    connection = await openReadOnlyConnection(tempFile);

    // 2) Load lap timing / sector tables.
    const { lapTimeRows, s1Rows, s2Rows } = await loadLapTables(connection);

    // 3) Build lap summaries and best sectors.
    const { laps, bestLapIndex, bestSectors } = buildLapSummaries(
      lapTimeRows,
      s1Rows,
      s2Rows
    );

    console.log('✅ Lap count:', laps.length, 'Best lap index:', bestLapIndex);

    return NextResponse.json(
      {
        success: true,
        laps,
        bestLapIndex,
        bestSectors,
        fileName: file.name,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('❌ /api/laps error:', err?.message);

    return NextResponse.json(
      {
        success: false,
        error: err?.message ?? 'Unknown error',
        laps: [],
      },
      { status: 500 }
    );
  } finally {
    // No public close() on DuckDBConnection; we only remove the temp file.
    await closeConnectionAndCleanup(connection, tempFile);
  }
}
