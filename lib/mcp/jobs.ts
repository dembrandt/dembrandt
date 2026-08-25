/**
 * The MCP job queue. Extraction takes tens of seconds, far longer than a client
 * will wait on a tool call, so tools enqueue and return a job_id.
 */

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface Job<T> {
  status: JobStatus;
  url: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  /** The slice the requesting tool asked for. */
  result?: unknown;
  /** The whole extraction, so later tools can read it back by job_id. */
  full?: T;
  error?: string;
}

export interface JobSummary {
  job_id: string;
  status: JobStatus;
  url: string;
  createdAt: number;
  completedAt?: number;
}

export interface JobQueueOptions<T> {
  run: (url: string, options: unknown) => Promise<JobResult<T>>;
  maxConcurrent?: number;
  /** How long a finished job stays readable. */
  ttlMs?: number;
  now?: () => number;
}

/** Completed jobs stay readable for an hour so later tools can cite their id. */
export const DEFAULT_JOB_TTL_MS = 3_600_000;

export class JobQueue<T = unknown> {
  #jobs = new Map<string, Job<T> & { opts: unknown; pick: (data: T) => unknown }>();
  #queue: string[] = [];
  #running = new Set<string>();
  #run: JobQueueOptions<T>['run'];
  #maxConcurrent: number;
  #ttlMs: number;
  #now: () => number;
  /** Resolves once nothing is queued or running. Test seam; also useful for shutdown. */
  #idle: Promise<void> = Promise.resolve();
  #settleIdle: () => void = () => {};

  constructor({ run, maxConcurrent = 2, ttlMs = DEFAULT_JOB_TTL_MS, now = Date.now }: JobQueueOptions<T>) {
    this.#run = run;
    this.#maxConcurrent = maxConcurrent;
    this.#ttlMs = ttlMs;
    this.#now = now;
  }

  enqueue(url: string, opts: unknown, pick: (data: T) => unknown): string {
    const id = `job_${this.#now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.#jobs.set(id, { status: 'queued', url, opts, pick, createdAt: this.#now() });
    this.#queue.push(id);
    if (this.#running.size === 0 && this.#queue.length === 1) {
      this.#idle = new Promise((resolve) => { this.#settleIdle = resolve; });
    }
    void this.#drain();
    return id;
  }

  get(id: string): Job<T> | null {
    return this.#jobs.get(id) ?? null;
  }

  list(): JobSummary[] {
    return Array.from(this.#jobs, ([id, job]) => ({
      job_id: id,
      status: job.status,
      url: job.url,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    }));
  }

  /** Only a job that has not started can be cancelled; a running browser is left alone. */
  cancel(id: string): boolean {
    const job = this.#jobs.get(id);
    if (!job || job.status !== 'queued') return false;
    job.status = 'cancelled';
    job.completedAt = this.#now();
    const idx = this.#queue.indexOf(id);
    if (idx !== -1) this.#queue.splice(idx, 1);
    if (this.#queue.length === 0 && this.#running.size === 0) this.#settleIdle();
    return true;
  }

  /** Resolves when every queued and running job has settled. */
  idle(): Promise<void> {
    if (this.#queue.length === 0 && this.#running.size === 0) return Promise.resolve();
    return this.#idle;
  }

  async #drain(): Promise<void> {
    while (this.#queue.length > 0 && this.#running.size < this.#maxConcurrent) {
      const id = this.#queue.shift() as string;
      const job = this.#jobs.get(id);
      if (!job || job.status === 'cancelled') continue;

      job.status = 'running';
      job.startedAt = this.#now();
      this.#running.add(id);

      this.#run(job.url, job.opts)
        .then((result) => {
          if (job.status === 'cancelled') return;
          if (result.ok) {
            job.status = 'completed';
            job.full = result.data;
            job.result = job.pick(result.data as T);
          } else {
            job.status = 'failed';
            job.error = result.error;
          }
        })
        .catch((err: unknown) => {
          if (job.status !== 'cancelled') {
            job.status = 'failed';
            job.error = err instanceof Error ? err.message : String(err);
          }
        })
        .finally(() => {
          job.completedAt = this.#now();
          this.#running.delete(id);
          if (this.#queue.length === 0 && this.#running.size === 0) this.#settleIdle();
          void this.#drain();
        });
    }
  }

  /** Drop finished jobs past the TTL so a long-lived server does not grow without bound. */
  cleanup(): void {
    const cutoff = this.#now() - this.#ttlMs;
    for (const [id, job] of this.#jobs) {
      if (
        ['completed', 'failed', 'cancelled'].includes(job.status) &&
        job.completedAt !== undefined &&
        job.completedAt < cutoff
      ) {
        this.#jobs.delete(id);
      }
    }
  }
}

export type Resolved<T> =
  | { ok: true; value: T; error?: undefined }
  | { ok: false; value?: undefined; error: string };

/**
 * Pure tools accept either an inline extraction or the job_id of a completed
 * one. The job path exists because an inline extraction has to travel back
 * through the model as a tool argument, which is prohibitively large.
 */
export function resolveExtraction<T>(
  inline: T | undefined,
  jobId: string | undefined,
  label: string,
  queue: Pick<JobQueue<T>, 'get'>,
): Resolved<T> {
  if (inline && Object.keys(inline as object).length > 0) return { ok: true, value: inline };
  if (!jobId) return { ok: false, error: `Pass either ${label} or job_id.` };
  const job = queue.get(jobId);
  if (!job) return { ok: false, error: `No job found with id: ${jobId}` };
  if (job.status !== 'completed') return { ok: false, error: `Job ${jobId} is ${job.status}, not completed.` };
  return { ok: true, value: job.full as T };
}
