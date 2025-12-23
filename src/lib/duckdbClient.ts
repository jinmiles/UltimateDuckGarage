// Helper utilities for working with DuckDB in Node.js.

import fs from 'fs/promises';
import path from 'path';
import type { DuckDBConnection } from '@duckdb/node-api';

const duckdbModule = require('@duckdb/node-api') as {
  DuckDBConnection: typeof DuckDBConnection;
};

/**
 * Save the uploaded DuckDB file to a temporary location and
 * return the absolute file path.
 */
export async function saveTempDuckDbFile(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const tempDir = path.join(process.cwd(), '.tmp');
  await fs.mkdir(tempDir, { recursive: true });
  const tempFile = path.join(tempDir, `lmu_${Date.now()}.duckdb`);
  await fs.writeFile(tempFile, buffer);
  return tempFile;
}

/**
 * Open a read-only DuckDB connection and ATTACH the given file as lmu_db.
 */
export async function openReadOnlyConnection(dbFile: string) {
  const connection = await duckdbModule.DuckDBConnection.create();
  await connection.run(`ATTACH '${dbFile}' AS lmu_db (READ_ONLY)`);
  return connection as InstanceType<typeof duckdbModule.DuckDBConnection>;
}

/**
 * Clean up resources used for telemetry analysis.
 * There is no public `close()` method on DuckDBConnection in @duckdb/node-api,
 * so we only remove the temporary database file here.
 */
export async function closeConnectionAndCleanup(
  _connection: DuckDBConnection | null,
  dbFile: string | null
) {
  if (dbFile) {
    try {
      await fs.unlink(dbFile);
    } catch {
      // ignore unlink errors (file may already be removed)
    }
  }
}

export type { DuckDBConnection };
