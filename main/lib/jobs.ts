import { query, queryOne } from "./db";

export type JobType = "FETCH_REPO" | "BUILD_ZOEKT" | "GC_INDEX";
export type JobStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "CANCELED";

export type Job = {
  id: number;
  jobType: JobType;
  status: JobStatus;
  priority: number;
  repoId: number | null;
  refId: number | null;
  payload: Record<string, unknown> | null;
  progress: number;
  message: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  // Joined data
  repoFullName?: string;
};

type DbJob = {
  id: number;
  job_type: JobType;
  status: JobStatus;
  priority: number;
  repo_id: number | null;
  ref_id: number | null;
  payload: Record<string, unknown> | null;
  progress: number;
  message: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  repo_full_name?: string;
};

function mapDbJobToJob(row: DbJob): Job {
  return {
    id: row.id,
    jobType: row.job_type,
    status: row.status,
    priority: row.priority,
    repoId: row.repo_id,
    refId: row.ref_id,
    payload: row.payload,
    progress: row.progress,
    message: row.message,
    error: row.error,
    attempts: row.attempts,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    repoFullName: row.repo_full_name,
  };
}

export async function listActiveJobs(): Promise<Job[]> {
  const rows = await query<DbJob>(`
    SELECT 
      j.*,
      r.full_name as repo_full_name
    FROM jobs j
    LEFT JOIN repos r ON r.id = j.repo_id
    WHERE j.status IN ('QUEUED', 'RUNNING')
    ORDER BY j.priority ASC, j.created_at ASC
  `);

  return rows.map(mapDbJobToJob);
}

export async function listRecentJobs(limit: number = 20): Promise<Job[]> {
  const rows = await query<DbJob>(`
    SELECT 
      j.*,
      r.full_name as repo_full_name
    FROM jobs j
    LEFT JOIN repos r ON r.id = j.repo_id
    ORDER BY j.created_at DESC
    LIMIT $1
  `, [limit]);

  return rows.map(mapDbJobToJob);
}

export async function getJobById(jobId: number): Promise<Job | null> {
  const row = await queryOne<DbJob>(`
    SELECT 
      j.*,
      r.full_name as repo_full_name
    FROM jobs j
    LEFT JOIN repos r ON r.id = j.repo_id
    WHERE j.id = $1
  `, [jobId]);

  return row ? mapDbJobToJob(row) : null;
}

export async function enqueueJob(
  jobType: JobType,
  repoId: number | null = null,
  refId: number | null = null,
  payload: Record<string, unknown> | null = null,
  priority: number = 100
): Promise<Job> {
  // Dedup: check if there's already a queued/running job of same type for same repo+ref
  if (repoId) {
    const existing = await queryOne<DbJob>(`
      SELECT * FROM jobs 
      WHERE repo_id = $1 
        AND (ref_id = $2 OR (ref_id IS NULL AND $2 IS NULL))
        AND job_type = $3 
        AND status IN ('QUEUED', 'RUNNING')
    `, [repoId, refId, jobType]);

    if (existing) {
      return mapDbJobToJob(existing);
    }
  }

  // pg driver handles jsonb serialization automatically
  const row = await queryOne<DbJob>(`
    INSERT INTO jobs (job_type, status, priority, repo_id, ref_id, payload)
    VALUES ($1, 'QUEUED', $2, $3, $4, $5)
    RETURNING *
  `, [jobType, priority, repoId, refId, payload]);

  if (!row) {
    throw new Error("Failed to enqueue job");
  }

  return mapDbJobToJob(row);
}

export async function updateJobStatus(
  jobId: number,
  status: JobStatus,
  updates: { progress?: number; message?: string; error?: string } = {}
): Promise<Job | null> {
  const setClauses: string[] = ["status = $2"];
  const params: unknown[] = [jobId, status];
  let paramIndex = 3;

  if (status === "RUNNING") {
    setClauses.push("started_at = COALESCE(started_at, now())");
    // Only increment attempts when transitioning from QUEUED → RUNNING (not if already RUNNING)
    setClauses.push("attempts = CASE WHEN status <> 'RUNNING' THEN attempts + 1 ELSE attempts END");
  }

  if (status === "DONE" || status === "FAILED" || status === "CANCELED") {
    setClauses.push("finished_at = now()");
  }

  if (updates.progress !== undefined) {
    setClauses.push(`progress = $${paramIndex++}`);
    params.push(updates.progress);
  }

  if (updates.message !== undefined) {
    setClauses.push(`message = $${paramIndex++}`);
    params.push(updates.message);
  }

  if (updates.error !== undefined) {
    setClauses.push(`error = $${paramIndex++}`);
    params.push(updates.error);
  }

  const row = await queryOne<DbJob>(`
    UPDATE jobs 
    SET ${setClauses.join(", ")}
    WHERE id = $1
    RETURNING *
  `, params);

  return row ? mapDbJobToJob(row) : null;
}

export async function cancelJobsForRepo(repoId: number): Promise<void> {
  await query(`
    UPDATE jobs 
    SET status = 'CANCELED', finished_at = now()
    WHERE repo_id = $1 AND status IN ('QUEUED', 'RUNNING')
  `, [repoId]);
}

