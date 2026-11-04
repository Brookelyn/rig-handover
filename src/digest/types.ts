// Plan morning-digest § 1. The contract every part of § 2 builds against; the reader lives
// next to it in src/digest/.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times keep the offset from the log (styleguide).
export type DigestRow = {
  job: string;
  owner: string | null; // null renders as `—`
  runs: number; // lines for this job, any status
  retries: number; // lines with status `retry`
  lastStatus: RunStatus;
  lastError: string | null; // the latest `error` seen for this job, null if none
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that didn't parse: counted, never thrown
};

// null when runs/<night>.jsonl doesn't exist (the page answers 404). An empty file is a Night
// with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
