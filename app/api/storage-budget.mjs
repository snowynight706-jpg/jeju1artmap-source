export const D1_SAFE_ROW_BYTES = 1_600_000;

export function utf8ByteLength(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") return new TextEncoder().encode(value).byteLength;
  if (typeof value === "number") return 8;
  if (typeof value === "boolean") return 1;
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function d1RowByteLength(values) {
  return values.reduce((total, value) => total + utf8ByteLength(value), 0);
}

export function validateD1RowBudget(values, maximumBytes = D1_SAFE_ROW_BYTES) {
  const bytes = d1RowByteLength(values);
  return {
    ok: bytes <= maximumBytes,
    bytes,
    maximumBytes,
    headroomBytes: maximumBytes - bytes,
  };
}
