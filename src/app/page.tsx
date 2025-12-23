'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceArea,
  ScatterChart,
  Scatter,
} from 'recharts';
import {
  Upload,
  Loader2,
  Zap,
  BarChart3,
  CheckSquare,
  Square,
} from 'lucide-react';
import { Card } from './ui/Card';
import { layout, text, table, icon } from './ui/theme';

type LapSummary = {
  lapIndex: number;
  lapTime: number;
  sectors: { s1: number; s2: number; s3: number };
};

type BestSectors = { s1: number; s2: number; s3: number };

type TelemetryPoint = {
  index: number;
  time: number;
  distance: number; // m
  speed: number;
  throttle: number;
  brake: number;
  lat: number | null;
  lon: number | null;
  lapIndex: number;
  engineRpm: number;
  steeringAngle: number;
};

type Row = {
  distance: number;
  [series: string]: number | undefined;
};

type TrackPoint = { x: number; y: number };

const COLORS = {
  first: '#3B82F6',
  second: '#EF4444',
  other: '#6B7280',
} as const;

const TRACK_DOMAIN: [number, number] = [-0.6, 0.6];

function formatLapTime(sec: number) {
  if (!Number.isFinite(sec) || sec <= 0) return '-';
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
}

export default function Home() {
  const [laps, setLaps] = useState<LapSummary[]>([]);
  const [bestLapIndex, setBestLapIndex] = useState<number | null>(null);
  const [bestSectors, setBestSectors] = useState<BestSectors | null>(null);

  const [telemetryData, setTelemetryData] = useState<
    Record<number, TelemetryPoint[]>
  >({});
  const [visibleLaps, setVisibleLaps] = useState<number[]>([]);

  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [currentFile, setCurrentFile] = useState<File | null>(null);

  const [xDomain, setXDomain] = useState<
    [number | 'auto', number | 'auto']
  >(['auto', 'auto']);
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);

  // Upload LMU session → /api/laps
  const loadLaps = useCallback(async (file: File) => {
    setFileName(file.name);
    setCurrentFile(file);
    setLoading(true);
    setLaps([]);
    setTelemetryData({});
    setVisibleLaps([]);
    setXDomain(['auto', 'auto']);
    setRefAreaLeft(null);
    setRefAreaRight(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/laps', { method: 'POST', body: formData });
      const result = await res.json();

      if (result.success && Array.isArray(result.laps)) {
        setLaps(result.laps as LapSummary[]);
        setBestLapIndex(
          typeof result.bestLapIndex === 'number' ? result.bestLapIndex : null
        );
        setBestSectors(result.bestSectors || null);
      } else {
        console.error('Failed to load lap list:', result.error);
      }
    } catch (err) {
      console.error('Error calling /api/laps:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Analyze selected lap → /api/telemetry
  const analyzeLap = useCallback(
    async (lapIndex: number) => {
      if (!currentFile) return;

      setLoading(true);

      const formData = new FormData();
      formData.append('file', currentFile);
      formData.append('lapIndex', String(lapIndex));

      try {
        const res = await fetch('/api/telemetry', {
          method: 'POST',
          body: formData,
        });
        const result = await res.json();

        if (result.success && Array.isArray(result.data)) {
          setTelemetryData((prev) => ({
            ...prev,
            [lapIndex]: result.data as TelemetryPoint[],
          }));
          setVisibleLaps((prev) =>
            prev.includes(lapIndex) ? prev : [...prev, lapIndex]
          );
        } else {
          console.error('Lap analysis failed:', result.error);
        }
      } catch (err) {
        console.error('Error calling /api/telemetry:', err);
      } finally {
        setLoading(false);
      }
    },
    [currentFile]
  );

  const toggleLapVisibility = useCallback((lapIndex: number) => {
    setVisibleLaps((prev) =>
      prev.includes(lapIndex)
        ? prev.filter((x) => x !== lapIndex)
        : [...prev, lapIndex]
    );
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadLaps(file);
  };

  const isPurple = (value: number, best?: number) =>
    best !== undefined && Math.abs(value - best) < 0.0005;

  // Merge by distance index (RPM + Steering added)
  const mergedRows: Row[] = useMemo(() => {
    const map = new Map<number, Row>();

    visibleLaps.forEach((lapIndex) => {
      const arr = telemetryData[lapIndex];
      if (!arr) return;

      const sorted = [...arr].sort((a, b) => a.distance - b.distance);

      sorted.forEach((p, i) => {
        const key = i;
        const existing = map.get(key);
        const sp = `lap_${lapIndex}_speed`;
        const th = `lap_${lapIndex}_throttle`;
        const br = `lap_${lapIndex}_brake`;
        const rpm = `lap_${lapIndex}_rpm`;
        const steer = `lap_${lapIndex}_steering`;

        if (!existing) {
          map.set(key, {
            distance: p.distance,
            [sp]: p.speed,
            [th]: p.throttle,
            [br]: p.brake,
            [rpm]: p.engineRpm,
            [steer]: p.steeringAngle,
          });
        } else {
          existing[sp] = p.speed;
          existing[th] = p.throttle;
          existing[br] = p.brake;
          existing[rpm] = p.engineRpm;
          existing[steer] = p.steeringAngle;
        }
      });
    });

    return Array.from(map.values()).sort((a, b) => a.distance - b.distance);
  }, [visibleLaps, telemetryData]);

  const colorForLap = (lapIndex: number): string => {
    const order = visibleLaps.indexOf(lapIndex);
    if (order === 0) return COLORS.first;
    if (order === 1) return COLORS.second;
    return COLORS.other;
  };

  // Build 2D track map points from GPS
  const makeTrackPoints = (lapIndex: number | undefined): TrackPoint[] => {
    if (lapIndex == null) return [];
    const arr = telemetryData[lapIndex];
    if (!arr || arr.length === 0) return [];

    const pts = arr.filter((p) => p.lat != null && p.lon != null);
    if (!pts.length) return [];

    const lat0 = pts[0].lat as number;
    const lon0 = pts[0].lon as number;
    const lat0Rad = (lat0 * Math.PI) / 180;

    const raw = pts.map((p) => {
      const lat = p.lat as number;
      const lon = p.lon as number;
      const dLat = ((lat - lat0) * Math.PI) / 180;
      const dLon = ((lon - lon0) * Math.PI) / 180;
      const x = dLon * Math.cos(lat0Rad);
      const y = dLat;
      return { x, y };
    });

    const xs = raw.map((p) => p.x);
    const ys = raw.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const span = Math.max(spanX, spanY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    return raw.map((p) => ({
      x: (p.x - cx) / span,
      y: (p.y - cy) / span,
    }));
  };

  const trackLap1 = useMemo(
    () => makeTrackPoints(visibleLaps[0]),
    [visibleLaps, telemetryData]
  );
  const trackLap2 = useMemo(
    () => makeTrackPoints(visibleLaps[1]),
    [visibleLaps, telemetryData]
  );

  // Zoom handlers for charts
  const onMouseDown = (e: any) => {
    if (!e || e.activeLabel == null) return;
    const x = Number(e.activeLabel);
    setRefAreaLeft(x);
    setRefAreaRight(x);
  };

  const onMouseMove = (e: any) => {
    if (refAreaLeft == null) return;
    if (!e || e.activeLabel == null) return;
    const x = Number(e.activeLabel);
    setRefAreaRight(x);
  };

  const zoom = () => {
    if (refAreaLeft == null || refAreaRight == null) {
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }
    let left = refAreaLeft;
    let right = refAreaRight;
    if (left === right) {
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }
    if (left > right) [left, right] = [right, left];

    setXDomain([left, right]);
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };

  const resetZoom = () => {
    setXDomain(['auto', 'auto']);
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };

  return (
    <div className={layout.page}>
      <header className={layout.headerBorder}>
        <div className={`${layout.container} py-8 text-center`}>
          <h1 className="text-6xl font-black bg-gradient-to-r from-orange-400 via-pink-500 to-orange-500 bg-clip-text text-transparent mb-4">
            🏎️ UltimateDuckGarage
          </h1>
          <p className={`text-xl ${text.subtle}`}>
            LMU Telemetry Analysis Tool
          </p>
        </div>
      </header>

      <main className={`${layout.container} py-12`}>
        {laps.length === 0 ? (
          <div className="text-center py-24 space-y-8">
            <div className="w-32 h-32 mx-auto bg-gradient-to-r from-orange-400/20 to-pink-500/20 rounded-3xl flex items-center justify-center border-4 border-orange-400/30">
              <Upload className="w-16 h-16 text-orange-400" />
            </div>
            <input
              id="file-upload"
              type="file"
              accept=".duckdb"
              onChange={handleFileChange}
              className="hidden"
            />
            <label htmlFor="file-upload" className="cursor-pointer block">
              <div className="px-12 py-6 bg-gradient-to-r from-orange-500 to-pink-500 text-white font-bold rounded-3xl text-xl hover:from-orange-600 hover:to-pink-600 mx-auto max-w-md shadow-2xl hover:shadow-orange-500/25 transition-all">
                Load LMU session file
              </div>
            </label>
          </div>
        ) : (
          <div className="space-y-8">
            {/* summary card */}
            <Card variant="highlight" className="text-center">
              <div className="flex flex-wrap items-center justify-center gap-4 mb-4">
                <Zap className={`${icon.header} text-emerald-400 animate-pulse`} />
                <div>
                  <h2 className={`text-3xl font-bold ${text.emeraldMain}`}>
                    {laps.length.toLocaleString()} laps •{' '}
                    <span className="text-emerald-300">
                      {visibleLaps.length} selected
                    </span>
                  </h2>
                  <p className={text.emeraldSoft}>{fileName}</p>
                </div>
              </div>
              {bestLapIndex !== null && laps[bestLapIndex] && (
                <p className="text-emerald-100">
                  Best lap: #{bestLapIndex + 1} (
                  {formatLapTime(laps[bestLapIndex].lapTime)})
                </p>
              )}
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* lap list */}
              <Card className="lg:col-span-1">
                <h3 className="text-xl font-bold mb-4">
                  Lap list ({Object.keys(telemetryData).length}/
                  {laps.length} analyzed)
                </h3>
                <div className="max-h-[520px] overflow-y-auto text-sm">
                  <table className="w-full">
                    <thead>
                      <tr className={table.headRow}>
                        <th className="w-8" />
                        <th className="text-left py-1 pr-2">Lap</th>
                        <th className="text-left py-1 pr-2">Lap time</th>
                        <th className="text-left py-1 pr-2">Sectors</th>
                        <th className="text-left py-1">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {laps.map((lap) => {
                        const isBest = bestLapIndex === lap.lapIndex;
                        const isVisible = visibleLaps.includes(lap.lapIndex);
                        const isAnalyzed = !!telemetryData[lap.lapIndex];

                        return (
                          <tr
                            key={lap.lapIndex}
                            className={
                              table.rowBorder +
                              ' ' +
                              (isVisible
                                ? 'bg-purple-700/40'
                                : isBest
                                ? 'bg-purple-500/20'
                                : '')
                            }
                          >
                            <td className="py-1 pr-2">
                              <button
                                className={`p-1 rounded transition ${
                                  isVisible
                                    ? 'text-purple-400 bg-purple-500/20'
                                    : 'text-slate-500 hover:text-emerald-400'
                                }`}
                                onClick={() =>
                                  toggleLapVisibility(lap.lapIndex)
                                }
                                disabled={!isAnalyzed}
                              >
                                {isVisible ? (
                                  <CheckSquare className="w-4 h-4" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>
                            </td>
                            <td className="py-1 pr-2">
                              #{lap.lapIndex + 1}
                              {isBest && (
                                <span className="ml-1 text-[10px] px-1 py-0.5 rounded-full bg-fuchsia-500 text-black">
                                  FASTEST
                                </span>
                              )}
                            </td>
                            <td className="py-1 pr-2">
                              {formatLapTime(lap.lapTime)}
                            </td>
                            <td className="py-1 pr-2">
                              <div className="flex flex-col gap-0.5 text-[10px] text-slate-200">
                                <div className="flex items-center gap-1">
                                  <span
                                    className={
                                      'inline-block w-4 h-2 rounded-sm ' +
                                      (bestSectors &&
                                      isPurple(
                                        lap.sectors.s1,
                                        bestSectors.s1
                                      )
                                        ? 'bg-fuchsia-500'
                                        : 'bg-slate-700')
                                    }
                                  />
                                  <span>
                                    S1 {formatLapTime(lap.sectors.s1)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span
                                    className={
                                      'inline-block w-4 h-2 rounded-sm ' +
                                      (bestSectors &&
                                      isPurple(
                                        lap.sectors.s2,
                                        bestSectors.s2
                                      )
                                        ? 'bg-fuchsia-500'
                                        : 'bg-slate-700')
                                    }
                                  />
                                  <span>
                                    S2 {formatLapTime(lap.sectors.s2)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span
                                    className={
                                      'inline-block w-4 h-2 rounded-sm ' +
                                      (bestSectors &&
                                      isPurple(
                                        lap.sectors.s3,
                                        bestSectors.s3
                                      )
                                        ? 'bg-fuchsia-500'
                                        : 'bg-slate-700')
                                    }
                                  />
                                  <span>
                                    S3 {formatLapTime(lap.sectors.s3)}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="py-1 text-right">
                              <button
                                className={`px-3 py-1 rounded-full text-[11px] font-bold transition ${
                                  isAnalyzed
                                    ? 'bg-slate-500 text-slate-200'
                                    : 'bg-emerald-500 text-black hover:bg-emerald-400'
                                }`}
                                onClick={() => analyzeLap(lap.lapIndex)}
                                disabled={isAnalyzed}
                              >
                                {isAnalyzed ? 'Done' : 'Analyze'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* right side: track map + charts */}
              <div className="lg:col-span-2 space-y-8">
                {/* track map */}
                <Card>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-bold flex items-center gap-3">
                      <BarChart3 className={`${icon.header} text-teal-400`} />
                      Track map (GPS Lat/Lon)
                    </h3>
                    <span className={`text-sm ${text.subtle}`}>
                      Laps:{' '}
                      {visibleLaps.slice(0, 2).length > 0
                        ? visibleLaps
                            .slice(0, 2)
                            .map((idx) => `#${idx + 1}`)
                            .join(', ')
                        : '-'}
                    </span>
                  </div>

                  {visibleLaps.length === 0 ? (
                    <p className={`text-sm ${text.subtle}`}>
                      Analyze a lap first, then enable it with the checkbox.
                    </p>
                  ) : (
                    <div className="w-full max-w-sm mx-auto">
                      <ResponsiveContainer width="100%" aspect={1}>
                        <ScatterChart
                          margin={{
                            top: 10,
                            right: 10,
                            bottom: 10,
                            left: 10,
                          }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            strokeOpacity={0.3}
                          />
                          <XAxis
                            type="number"
                            dataKey="x"
                            domain={TRACK_DOMAIN}
                            hide
                          />
                          <YAxis
                            type="number"
                            dataKey="y"
                            domain={TRACK_DOMAIN}
                            hide
                          />

                          {trackLap1.length > 0 && (
                            <Scatter
                              data={trackLap1}
                              line={{ stroke: COLORS.first, strokeWidth: 2 }}
                              lineJointType="monotoneX"
                              fill="none"
                            />
                          )}

                          {trackLap2.length > 0 && (
                            <Scatter
                              data={trackLap2}
                              line={{ stroke: COLORS.second, strokeWidth: 2 }}
                              lineJointType="monotoneX"
                              fill="none"
                            />
                          )}
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Card>

                {mergedRows.length > 0 ? (
                  <>
                    {/* speed chart */}
                    <Card>
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-2xl font-bold flex items-center gap-3">
                          <BarChart3 className={`${icon.header} text-blue-400`} />
                          Speed comparison ({visibleLaps.length} laps)
                        </h3>
                        <div className="flex items-center gap-4">
                          <button
                            className="px-3 py-1 rounded-full bg-slate-700 text-slate-200 text-xs hover:bg-slate-600"
                            onClick={resetZoom}
                          >
                            Reset zoom
                          </button>
                          <span className={`text-sm ${text.subtle}`}>
                            {mergedRows.length.toLocaleString()} points
                          </span>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={320}>
                        <LineChart
                          data={mergedRows}
                          onMouseDown={onMouseDown}
                          onMouseMove={onMouseMove}
                          onMouseUp={zoom}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            strokeOpacity={0.3}
                          />
                          <XAxis
                            dataKey="distance"
                            name="Distance"
                            tickFormatter={(v) => Number(v).toFixed(0)}
                            unit=" m"
                            domain={xDomain}
                            type="number"
                            allowDataOverflow
                          />
                          <YAxis label={{ value: 'km/h', angle: -90 }} />
                          <Tooltip
                            formatter={(value, rawName) => {
                              const name = rawName as string | undefined;
                              if (name === 'distance') {
                                return [
                                  `${Number(value).toFixed(0)} m`,
                                  'Distance',
                                ];
                              }
                              if (
                                typeof name === 'string' &&
                                name.endsWith('_speed')
                              ) {
                                return [
                                  `${Number(value).toFixed(1)} km/h`,
                                  'Speed',
                                ];
                              }
                              return [value, name ?? ''];
                            }}
                            labelFormatter={(label) =>
                              `${Number(label).toFixed(0)} m`
                            }
                          />
                          <Legend />
                          {visibleLaps.map((lapIndex) => {
                            const lapInfo = laps.find(
                              (l) => l.lapIndex === lapIndex
                            );
                            const key = `lap_${lapIndex}_speed`;
                            const color = colorForLap(lapIndex);
                            return (
                              <Line
                                key={key}
                                type="monotone"
                                dataKey={key}
                                stroke={color}
                                strokeWidth={2}
                                dot={false}
                                name={`#${lapIndex + 1} ${
                                  lapInfo
                                    ? formatLapTime(lapInfo.lapTime)
                                    : ''
                                }`}
                                isAnimationActive={false}
                              />
                            );
                          })}
                          {refAreaLeft != null && refAreaRight != null && (
                            <ReferenceArea
                              x1={refAreaLeft}
                              x2={refAreaRight}
                              strokeOpacity={0.3}
                            />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </Card>

                    {/* throttle chart */}
                    <Card>
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-2xl font-bold flex items-center gap-3">
                          <BarChart3 className={`${icon.header} text-green-400`} />
                          Throttle comparison
                        </h3>
                        <div className="flex items-center gap-4">
                          <button
                            className="px-3 py-1 rounded-full bg-slate-700 text-slate-200 text-xs hover:bg-slate-600"
                            onClick={resetZoom}
                          >
                            Reset zoom
                          </button>
                          <span className={`text-sm ${text.subtle}`}>
                            {mergedRows.length.toLocaleString()} points
                          </span>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart
                          data={mergedRows}
                          onMouseDown={onMouseDown}
                          onMouseMove={onMouseMove}
                          onMouseUp={zoom}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            strokeOpacity={0.3}
                          />
                          <XAxis
                            dataKey="distance"
                            name="Distance"
                            tickFormatter={(v) => Number(v).toFixed(0)}
                            unit=" m"
                            domain={xDomain}
                            type="number"
                            allowDataOverflow
                          />
                          <YAxis
                            label={{ value: '%', angle: -90 }}
                            domain={[0, 100]}
                          />
                          <Tooltip
                            formatter={(value, rawName) => {
                              const name = rawName as string | undefined;
                              if (name === 'distance') {
                                return [
                                  `${Number(value).toFixed(0)} m`,
                                  'Distance',
                                ];
                              }
                              if (
                                typeof name === 'string' &&
                                name.endsWith('_throttle')
                              ) {
                                return [
                                  `${Number(value).toFixed(1)} %`,
                                  'Throttle',
                                ];
                              }
                              return [value, name ?? ''];
                            }}
                            labelFormatter={(label) =>
                              `${Number(label).toFixed(0)} m`
                            }
                          />
                          <Legend />
                          {visibleLaps.map((lapIndex) => {
                            const base = colorForLap(lapIndex);
                            const keyTh = `lap_${lapIndex}_throttle`;
                            return (
                              <Line
                                key={keyTh}
                                type="stepAfter"
                                dataKey={keyTh}
                                stroke={base}
                                strokeWidth={2}
                                dot={false}
                                name={`#${lapIndex + 1} Throttle`}
                                isAnimationActive={false}
                              />
                            );
                          })}
                          {refAreaLeft != null && refAreaRight != null && (
                            <ReferenceArea
                              x1={refAreaLeft}
                              x2={refAreaRight}
                              strokeOpacity={0.3}
                            />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </Card>

                    {/* brake chart */}
                    <Card>
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-2xl font-bold flex items-center gap-3">
                          <BarChart3 className={`${icon.header} text-red-400`} />
                          Brake comparison
                        </h3>
                        <div className="flex items-center gap-4">
                          <button
                            className="px-3 py-1 rounded-full bg-slate-700 text-slate-200 text-xs hover:bg-slate-600"
                            onClick={resetZoom}
                          >
                            Reset zoom
                          </button>
                          <span className={`text-sm ${text.subtle}`}>
                            {mergedRows.length.toLocaleString()} points
                          </span>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart
                          data={mergedRows}
                          onMouseDown={onMouseDown}
                          onMouseMove={onMouseMove}
                          onMouseUp={zoom}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            strokeOpacity={0.3}
                          />
                          <XAxis
                            dataKey="distance"
                            name="Distance"
                            tickFormatter={(v) => Number(v).toFixed(0)}
                            unit=" m"
                            domain={xDomain}
                            type="number"
                            allowDataOverflow
                          />
                          <YAxis
                            label={{ value: '%', angle: -90 }}
                            domain={[0, 100]}
                          />
                          <Tooltip
                            formatter={(value, rawName) => {
                              const name = rawName as string | undefined;
                              if (name === 'distance') {
                                return [
                                  `${Number(value).toFixed(0)} m`,
                                  'Distance',
                                ];
                              }
                              if (
                                typeof name === 'string' &&
                                name.endsWith('_brake')
                              ) {
                                return [
                                  `${Number(value).toFixed(1)} %`,
                                  'Brake',
                                ];
                              }
                              return [value, name ?? ''];
                            }}
                            labelFormatter={(label) =>
                              `${Number(label).toFixed(0)} m`
                            }
                          />
                          <Legend />
                          {visibleLaps.map((lapIndex) => {
                            const base = colorForLap(lapIndex);
                            const keyBr = `lap_${lapIndex}_brake`;
                            return (
                              <Line
                                key={keyBr}
                                type="stepAfter"
                                dataKey={keyBr}
                                stroke={base}
                                strokeWidth={2}
                                dot={false}
                                name={`#${lapIndex + 1} Brake`}
                                isAnimationActive={false}
                              />
                            );
                          })}
                          {refAreaLeft != null && refAreaRight != null && (
                            <ReferenceArea
                              x1={refAreaLeft}
                              x2={refAreaRight}
                              strokeOpacity={0.3}
                            />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </Card>
                    
                      {/* RPM chart */}
                    <Card>
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-2xl font-bold flex items-center gap-3">
                          <BarChart3 className={`${icon.header} text-yellow-400`} />
                          RPM comparison
                        </h3>
                        <div className="flex items-center gap-4">
                          <button
                            className="px-3 py-1 rounded-full bg-slate-700 text-slate-200 text-xs hover:bg-slate-600"
                            onClick={resetZoom}
                          >
                            Reset zoom
                          </button>
                          <span className={`text-sm ${text.subtle}`}>
                            {mergedRows.length.toLocaleString()} points
                          </span>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart
                          data={mergedRows}
                          onMouseDown={onMouseDown}
                          onMouseMove={onMouseMove}
                          onMouseUp={zoom}
                        >
                          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                          <XAxis
                            dataKey="distance"
                            name="Distance"
                            tickFormatter={(v) => Number(v).toFixed(0)}
                            unit=" m"
                            domain={xDomain}
                            type="number"
                            allowDataOverflow
                          />
                          <YAxis 
                            label={{ value: 'RPM', angle: -90 }} 
                            domain={[4000, 8000]}
                          />
                          <Tooltip
                            formatter={(value, rawName) => {
                              const name = rawName as string | undefined;
                              if (name === 'distance') {
                                return [`${Number(value).toFixed(0)} m`, 'Distance'];
                              }
                              if (typeof name === 'string' && name.endsWith('_rpm')) {
                                return [`${Number(value).toFixed(0)} RPM`, 'Engine RPM'];
                              }
                              return [value, name ?? ''];
                            }}
                            labelFormatter={(label) => `${Number(label).toFixed(0)} m`}
                          />
                          <Legend />
                          {visibleLaps.map((lapIndex) => {
                            const base = colorForLap(lapIndex);
                            const keyRpm = `lap_${lapIndex}_rpm`;
                            return (
                              <Line
                                key={keyRpm}
                                type="monotone"
                                dataKey={keyRpm}
                                stroke={base}
                                strokeWidth={2}
                                dot={false}
                                name={`#${lapIndex + 1} RPM`}
                                isAnimationActive={false}
                              />
                            );
                          })}
                          {refAreaLeft != null && refAreaRight != null && (
                            <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </Card>
                      
                      {/* Steering chart */}
                    <Card>
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-2xl font-bold flex items-center gap-3">
                          <BarChart3 className={`${icon.header} text-purple-400`} />
                          Steering comparison
                        </h3>
                        <div className="flex items-center gap-4">
                          <button
                            className="px-3 py-1 rounded-full bg-slate-700 text-slate-200 text-xs hover:bg-slate-600"
                            onClick={resetZoom}
                          >
                            Reset zoom
                          </button>
                          <span className={`text-sm ${text.subtle}`}>
                            {mergedRows.length.toLocaleString()} points
                          </span>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart
                          data={mergedRows}
                          onMouseDown={onMouseDown}
                          onMouseMove={onMouseMove}
                          onMouseUp={zoom}
                        >
                          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                          <XAxis
                            dataKey="distance"
                            name="Distance"
                            tickFormatter={(v) => Number(v).toFixed(0)}
                            unit=" m"
                            domain={xDomain}
                            type="number"
                            allowDataOverflow
                          />
                          <YAxis 
                            label={{ value: '°', angle: -90 }}
                            domain={[-90, 90]}
                          />
                          <Tooltip
                            formatter={(value, rawName) => {
                              const name = rawName as string | undefined;
                              if (name === 'distance') {
                                return [`${Number(value).toFixed(0)} m`, 'Distance'];
                              }
                              if (typeof name === 'string' && name.endsWith('_steering')) {
                                return [`${Number(value).toFixed(1)}°`, 'Steering'];
                              }
                              return [value, name ?? ''];
                            }}
                            labelFormatter={(label) => `${Number(label).toFixed(0)} m`}
                          />
                          <Legend />
                          {visibleLaps.map((lapIndex) => {
                            const base = colorForLap(lapIndex);
                            const keySteer = `lap_${lapIndex}_steering`;
                            return (
                              <Line
                                key={keySteer}
                                type="monotone"
                                dataKey={keySteer}
                                stroke={base}
                                strokeWidth={2}
                                dot={false}
                                name={`#${lapIndex + 1} Steering`}
                                isAnimationActive={false}
                              />
                            );
                          })}
                          {refAreaLeft != null && refAreaRight != null && (
                            <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </Card>


                  </>
                ) : (
                  <Card variant="empty">
                    <BarChart3 className="w-16 h-16 text-slate-500 mx-auto mb-4" />
                    <h3 className="text-2xl font-bold text-slate-400 mb-2">
                      No charts
                    </h3>
                    <p className={text.softer}>
                      Analyze at least one lap and enable it with the checkbox.
                    </p>
                  </Card>
                )}
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-900/90 backdrop-blur-xl p-12 rounded-3xl text-center border border-slate-700">
              <Loader2 className="w-16 h-16 text-orange-400 animate-spin mx-auto mb-6" />
              <h3 className="text-2xl font-bold mb-4">Processing data...</h3>
              <p className={text.subtle}>
                Calculating lap list or telemetry, please wait
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
