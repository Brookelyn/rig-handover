import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunLine, RunStatus } from './types.js';

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

// Parse at the edge (styleguide): anything that isn't a whole, well-formed line is null.
export function parseLine(text: string): RunLine | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof o.job !== 'string') return null;
  if (!STATUSES.includes(o.status as RunStatus)) return null;
  if (o.owner !== null && typeof o.owner !== 'string') return null;
  if (o.error !== undefined && typeof o.error !== 'string') return null;
  return {
    at: o.at,
    job: o.job,
    status: o.status as RunStatus,
    owner: o.owner,
    ...(o.error !== undefined ? { error: o.error as string } : {}),
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }

  const byJob = new Map<string, DigestRow>();
  let badLines = 0;
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) {
      badLines++;
      continue;
    }
    const row = byJob.get(line.job);
    if (!row) {
      byJob.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        lastStatus: line.status,
        lastError: line.error ?? null,
        firstAt: line.at,
        lastAt: line.at,
      });
      continue;
    }
    // Lines are in log order, so the latest line wins for status, owner and time.
    row.runs++;
    if (line.status === 'retry') row.retries++;
    row.lastStatus = line.status;
    row.lastAt = line.at;
    row.owner = line.owner ?? row.owner;
    if (line.error !== undefined) row.lastError = line.error;
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines } satisfies Night;
};
