import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read.js';

const NORMAL = '2026-01-01';
const EMPTY = '2026-01-02';
const BAD = '2026-01-03';
const MISSING = '2026-01-04';

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  process.env.LANE_MARKER = 'TEST-MARKER';
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  const normal = [
    line('2026-01-01T02:00:00+01:00', 'zeta-sync', 'ok', 'bee'),
    line('2026-01-01T02:05:00+01:00', 'alpha-backup', 'retry', 'sam', 'timeout'),
    line('2026-01-01T02:10:00+01:00', 'alpha-backup', 'ok', 'sam'),
    line('2026-01-01T03:00:00+01:00', 'mid-report', 'fail', null, 'boom'),
  ];
  writeFileSync(join(runsDir, `${NORMAL}.jsonl`), normal.join('\n') + '\n');
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  const bad = [
    line('2026-01-03T02:00:00+01:00', 'good-one', 'ok', 'bee'),
    'this is not json',
    line('2026-01-03T02:30:00+01:00', 'good-two', 'ok', null),
  ];
  writeFileSync(join(runsDir, `${BAD}.jsonl`), bad.join('\n') + '\n');
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

const page = async (night: string) => {
  const res = await app.request(`/digest/${night}`);
  return { res, html: await res.text() };
};
const api = (night: string) => app.request(`/api/digest/${night}`);

describe('GET /digest/:night', () => {
  it('renders a night with a file: every job and the lane banner', async () => {
    const { res, html } = await page(NORMAL);
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    for (const job of ['alpha-backup', 'mid-report', 'zeta-sync']) expect(html).toContain(job);
  });

  it('404s for a night with no file', async () => {
    const { res } = await page(MISSING);
    expect(res.status).toBe(404);
  });

  it('says "nothing ran" for an empty file', async () => {
    const { res, html } = await page(EMPTY);
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('still renders the good rows when a line is bad', async () => {
    const { res, html } = await page(BAD);
    expect(res.status).toBe(200);
    expect(html).toContain('good-one');
    expect(html).toContain('good-two');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the night exactly as readNight does', async () => {
    const res = await api(NORMAL);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(readNight(runsDir, NORMAL));
    expect(body).toMatchObject({ night: NORMAL, badLines: 0 });
  });

  it('404s for a night with no file', async () => {
    expect((await api(MISSING)).status).toBe(404);
  });

  it('returns no rows for an empty file', async () => {
    const res = await api(EMPTY);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: EMPTY, rows: [], badLines: 0 });
  });

  it('counts a bad line and keeps the good rows', async () => {
    const res = await api(BAD);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { job: string }[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['good-one', 'good-two']);
  });
});

describe('page and JSON agree', () => {
  it('lists the jobs in the page in the same order as the JSON rows', async () => {
    const body = (await (await api(NORMAL)).json()) as { rows: { job: string }[] };
    const jobs = body.rows.map((r) => r.job);
    const { html } = await page(NORMAL);
    const positions = jobs.map((j) => html.indexOf(j));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
