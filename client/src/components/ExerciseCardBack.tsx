import { useMemo } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Exercise, ExerciseSessionHistory, Settings } from "@/lib/storage";

// ─── Readiness ──────────────────────────────────────────────────────────────────

type ReadinessStatus = "neutral" | "ready" | "close" | "building" | "struggling";

function computeReadiness(
  history: ExerciseSessionHistory[],
  maxReps: number,
): { label: string; status: ReadinessStatus } {
  if (history.length === 0) {
    return { label: "No history yet", status: "neutral" };
  }

  const last = history[history.length - 1];
  const prev = history.length >= 2 ? history[history.length - 2] : null;

  if (prev && last.weight > prev.weight) {
    return { label: "New weight — building back up", status: "building" };
  }

  const lastTwo = history.slice(-2);
  const bothHitMax = lastTwo.length === 2 && lastTwo.every((h) => h.avgReps >= maxReps);
  const lastHitMax = last.avgReps >= maxReps;

  if (bothHitMax) {
    return { label: "Ready to increase weight", status: "ready" };
  }
  if (lastHitMax) {
    return { label: "Hit max reps — one more session to confirm", status: "close" };
  }
  if (prev && last.avgReps < prev.avgReps - 0.5) {
    return { label: "Reps declining — focus on form", status: "struggling" };
  }

  return { label: "Building toward target reps", status: "building" };
}

const READINESS_STYLES: Record<ReadinessStatus, { color: string; bg: string; border: string }> = {
  neutral:    { color: "var(--color-text-muted)",  bg: "var(--color-surface-2)",   border: "var(--color-border)" },
  ready:      { color: "hsl(142 70% 50%)",          bg: "hsl(142 50% 14%)",         border: "hsl(142 40% 25%)" },
  close:      { color: "hsl(142 60% 45%)",          bg: "hsl(142 40% 13%)",         border: "hsl(142 35% 22%)" },
  building:   { color: "hsl(200 70% 60%)",          bg: "hsl(200 50% 14%)",         border: "hsl(200 40% 25%)" },
  struggling: { color: "var(--color-warning)",      bg: "hsl(25 60% 18%)",          border: "hsl(25 50% 30%)" },
};

// ─── Stat box ───────────────────────────────────────────────────────────────────

function StatBox({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ flex: 1, background: "var(--color-surface-2)", borderRadius: "10px", padding: "10px 12px" }}>
      <p style={{ fontSize: "10px", fontWeight: 600, color: "var(--color-text-muted)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: "4px" }}>
        {label}
      </p>
      <p style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: valueColor }}>
        {value}
      </p>
    </div>
  );
}

// ─── ExerciseCardBack ───────────────────────────────────────────────────────────

export function ExerciseCardBack({
  exercise,
  history,
  settings,
  onFlip,
}: {
  exercise: Exercise;
  history: ExerciseSessionHistory[];
  settings: Settings;
  onFlip: () => void;
}) {
  const unit = settings.weightUnit;
  const hasHistory = history.length > 0;

  const bestWeight = hasHistory ? Math.max(...history.map((h) => h.weight)) : exercise.weight;
  const firstWeight = hasHistory ? history[0].weight : exercise.weight;
  const weightGain = bestWeight - firstWeight;

  const readiness = useMemo(
    () => computeReadiness(history, exercise.maxReps),
    [history, exercise.maxReps],
  );
  const readinessStyle = READINESS_STYLES[readiness.status];

  const chartData = history.slice(-15).map((h) => ({
    label: new Date(h.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    weight: h.weight,
    reps: parseFloat(h.avgReps.toFixed(1)),
  }));

  const recentSessions = history.slice(-5).reverse();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <h2 style={{ fontSize: "var(--text-base)", fontWeight: 700, flex: 1, minWidth: 0 }} data-testid="exercise-name">
          {exercise.name}
        </h2>
        <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: 600 }}>Progress</span>
        <button
          onClick={onFlip}
          data-testid="btn-flip-back"
          aria-label="Back to exercise"
          style={{
            background: "transparent",
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
            padding: "4px 8px",
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--color-text-muted)",
            cursor: "pointer",
          }}
        >
          ← Back
        </button>
      </div>

      {!hasHistory ? (
        <p
          data-testid="no-history-message"
          style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", textAlign: "center", padding: "20px 0" }}
        >
          No history yet — log a session to see your progress.
        </p>
      ) : (
        <>
          {/* Headline stats */}
          <div style={{ display: "flex", gap: "8px" }}>
            <StatBox label="Best" value={`${bestWeight}${unit}`} />
            <StatBox label="Sessions" value={String(history.length)} />
            <StatBox
              label="Gained"
              value={`${weightGain > 0 ? "+" : ""}${weightGain}${unit}`}
              valueColor={weightGain > 0 ? "var(--color-success)" : undefined}
            />
          </div>

          {/* Readiness banner */}
          <div
            data-testid="readiness-banner"
            style={{
              borderRadius: "10px",
              padding: "8px 12px",
              background: readinessStyle.bg,
              border: `1px solid ${readinessStyle.border}`,
              fontSize: "12px",
              fontWeight: 600,
              color: readinessStyle.color,
            }}
          >
            {readiness.label}
          </div>

          {/* Below-min reps warning */}
          {exercise.minReps != null && recentSessions.length > 0 && recentSessions[0].avgReps < exercise.minReps && (
            <div
              data-testid="below-min-reps-warning"
              style={{
                borderRadius: "10px",
                padding: "8px 12px",
                background: "hsl(25 60% 18%)",
                border: "1px solid hsl(25 50% 30%)",
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--color-warning)",
              }}
            >
              Last session was below your minimum reps — consider reducing the weight.
            </div>
          )}

          {/* Progress chart — weight (step) + avg reps (dashed) */}
          {chartData.length >= 2 && (
            <div>
              <p style={{ fontSize: "10px", fontWeight: 600, color: "var(--color-text-muted)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: "8px" }}>
                Weight & Reps
              </p>
              <div style={{ height: 120 }} data-testid="progress-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 9, fill: "hsl(220 8% 45%)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="weight"
                      orientation="left"
                      tick={{ fontSize: 9, fill: "hsl(142 55% 38%)" }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <YAxis
                      yAxisId="reps"
                      orientation="right"
                      domain={[0, exercise.maxReps]}
                      tick={{ fontSize: 9, fill: "hsl(220 8% 45%)" }}
                      axisLine={false}
                      tickLine={false}
                      width={20}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(220 13% 14%)",
                        border: "1px solid hsl(220 10% 22%)",
                        borderRadius: "8px",
                        fontSize: "11px",
                        color: "hsl(220 10% 92%)",
                      }}
                      formatter={(value: number, name: string) => [
                        name === "weight" ? `${value}${unit}` : `${value} reps`,
                        name === "weight" ? "Weight" : "Avg reps",
                      ]}
                    />
                    <Line
                      yAxisId="weight"
                      dataKey="weight"
                      type="stepAfter"
                      stroke="hsl(142 55% 38%)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                    <Line
                      yAxisId="reps"
                      dataKey="reps"
                      type="monotone"
                      stroke="hsl(220 8% 50%)"
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                      dot={{ r: 2, fill: "hsl(220 8% 50%)", strokeWidth: 0 }}
                      activeDot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                <span style={{ fontSize: "10px", color: "hsl(142 55% 38%)", fontWeight: 600 }}>— Weight</span>
                <span style={{ fontSize: "10px", color: "hsl(220 8% 50%)", fontWeight: 600 }}>· · Avg reps</span>
              </div>
            </div>
          )}

          {/* Recent sessions table */}
          <div>
            <p style={{ fontSize: "10px", fontWeight: 600, color: "var(--color-text-muted)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: "6px" }}>
              Recent Sessions
            </p>
            <div style={{ display: "flex", flexDirection: "column" }} data-testid="recent-sessions">
              {recentSessions.map((h, i) => {
                const isWeightUp = i < recentSessions.length - 1 && h.weight > recentSessions[i + 1].weight;
                const date = new Date(h.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                return (
                  <div
                    key={h.sessionId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "6px 0",
                      borderBottom: i < recentSessions.length - 1 ? "1px solid hsl(220 10% 16%)" : "none",
                    }}
                  >
                    <span style={{ fontSize: "11px", color: "var(--color-text-muted)", minWidth: "44px", flexShrink: 0 }}>
                      {date}
                    </span>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: isWeightUp ? "var(--color-success)" : "var(--color-text)", minWidth: "52px", flexShrink: 0 }}>
                      {h.weight}{unit}{isWeightUp && " ↑"}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--color-text-muted)", flex: 1 }}>
                      {h.repsPerSet.join(", ")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
