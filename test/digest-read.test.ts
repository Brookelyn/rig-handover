import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line', () => {
    const n = readNight('runs', '2026-10-28')!;
    expect(n.badLines).toBe(1);
    expect(n.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);

    const refresh = n.rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(refresh).toMatchObject({
      runs: 4,
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });

    expect(n.rows.find((r) => r.job === 'notes/backup')).toMatchObject({ lastStatus: 'fail', fails: 1, lastError: 'quota exceeded' });
    expect(n.rows.find((r) => r.job === 'digest/render')!.owner).toBeNull();
    expect(n.rows.find((r) => r.job === 'lane/sync')).toMatchObject({ runs: 8, retries: 1 });
  });

  it('returns null for a night with no file', () => {
    expect(readNight('runs', '1999-01-01')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(join(dir, '2026-11-01.jsonl'), '');
    expect(readNight(dir, '2026-11-01')).toEqual({ night: '2026-11-01', rows: [], badLines: 0 });
  });
});
