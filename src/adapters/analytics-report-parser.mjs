function integer(value) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function asString(value, fallback = "") {
  return value === null || value === undefined ? fallback : String(value).trim();
}

function firstText(row, keys, fallback = "") {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return fallback;
}

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }

    if (char === ',') {
      cells.push(cell.trim());
      cell = "";
      continue;
    }

    cell += char;
  }

  cells.push(cell.trim());
  return cells;
}

function parseCsvText(text) {
  const lines = String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
  const rows = [];

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    rows.push(row);
  }

  return rows;
}

function unwrapJsonRecords(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];

  const candidates = [
    value.records,
    value.rows,
    value.data,
    value.items,
    value.metrics,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [value];
}

export function normalizeAnalyticsReportRow(row = {}, options = {}) {
  const rawPlatform = firstText(row, [
    "platform",
    "channel",
    "network",
    "service",
    "source_platform",
  ], options.platform ?? "Unknown");

  const snapshotDate = firstText(row, [
    "snapshotDate",
    "snapshot_date",
    "date",
    "day",
    "report_date",
  ], options.snapshotDate ?? new Date().toISOString().slice(0, 10));

  const views = integer(
    row.views ?? row.impressions ?? row.videoViews ?? row.play_count,
  );

  const reach = integer(
    row.reach ?? row.uniqueReach ?? row.impressions ?? row.views,
  );

  const engagements = integer(
    row.engagements ?? row.interactions ?? row.likes ?? row.engagement,
  );

  const followerDelta = integer(
    row.followerDelta ?? row.followers ?? row.growth ?? row.netFollowers,
  );

  return {
    platform: asString(rawPlatform, "Unknown"),
    snapshotDate,
    views,
    reach,
    engagements,
    followerDelta,
    isDemo: false,
    source: firstText(row, ["source", "reportSource", "origin"], options.source ?? "analytics-report"),
    provider: firstText(row, ["provider", "network", "platformProvider"], options.provider ?? "imported-report"),
    brandId: row.brandId ?? row.brand_id ?? options.brandId ?? null,
    contentItemId: row.contentItemId ?? row.content_item_id ?? options.contentItemId ?? null,
  };
}

export function parseAnalyticsReport(input, options = {}) {
  if (input === null || input === undefined) {
    throw new Error("OrbitOS analytics report is required.");
  }

  const text = String(input).trim();
  if (!text) {
    throw new Error("OrbitOS analytics report is empty.");
  }

  const format = String(options.format ?? "auto").toLowerCase();
  let rows = [];

  if (format === "json" || text.startsWith("{") || text.startsWith("[")) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      if (format === "json") {
        throw new Error("OrbitOS analytics report JSON could not be parsed.");
      }
    }

    if (parsed !== undefined) {
      rows = unwrapJsonRecords(parsed);
    }
  }

  if (rows.length === 0) {
    rows = parseCsvText(text);
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("OrbitOS analytics report contains no rows.");
  }

  return rows.map((row) => normalizeAnalyticsReportRow(row, options));
}
