export const MAP_SETTLE_DIAGNOSTIC_INTERVAL = 5;
export const MAP_SETTLE_SLOW_SAMPLE_MS = 200;

export function shouldSendMapSettleDiagnostic(sampleNumber, durationMs) {
  const normalizedSampleNumber = Math.max(1, Math.floor(Number(sampleNumber) || 1));
  const normalizedDuration = Math.max(0, Number(durationMs) || 0);
  return normalizedDuration >= MAP_SETTLE_SLOW_SAMPLE_MS
    || normalizedSampleNumber === 1
    || normalizedSampleNumber % MAP_SETTLE_DIAGNOSTIC_INTERVAL === 0;
}
