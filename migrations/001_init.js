/**
 * Neptune v1 (local-first) schema:
 * - Track repos user added
 * - Track branch head SHAs
 * - Track zoekt index snapshots + active pointer
 * - Track background jobs
 * - Repo sets (search contexts) + saved searches
 *
 * Assumes PostgreSQL and optionally pg_trgm for fuzzy repo search.
 */

exports.up = (pgm) => {
    // Extensions
    pgm.sql(`create extension if not exists pg_trgm;`);
  
    // --- App state (single row) ---
    pgm.sql(`
      create table if not exists app_state (
        id int primary key default 1,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        default_repo_set_id bigint,
        auto_fetch_enabled boolean not null default true,
        auto_fetch_interval_sec int not null default 300
      );
    `);
  
    // --- GitHub identity (single row; token stored elsewhere e.g. keychain) ---
    pgm.sql(`
      create table if not exists github_identity (
        id int primary key default 1,
        github_user_id bigint not null,
        login text not null,
        name text,
        avatar_url text,
        scopes text,
        updated_at timestamptz not null default now()
      );
    `);
  
    // --- Tracked repos ---
    pgm.sql(`
      create table if not exists repos (
        id bigserial primary key,
  
        provider text not null default 'github',
        external_repo_id bigint,
        host_url text not null default 'https://github.com',
  
        owner text not null,
        name text not null,
        full_name text not null unique,
  
        clone_url text not null,
        default_branch text not null default 'main',
  
        is_private boolean not null default true,
        is_fork boolean not null default false,
        is_archived boolean not null default false,
  
        local_mirror_path text not null,   -- e.g. ~/.neptune/repos/owner/repo.git
  
        enabled boolean not null default true,
        pinned boolean not null default false,
  
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);
  
    pgm.sql(`
      create index if not exists repos_owner_name_idx
      on repos(owner, name);
    `);
  
    pgm.sql(`
      create index if not exists repos_enabled_idx
      on repos(enabled);
    `);
  
    // Fuzzy search by full_name (requires pg_trgm)
    pgm.sql(`
      create index if not exists repos_full_name_trgm_idx
      on repos using gin (full_name gin_trgm_ops);
    `);
  
    // --- Refs (branches) we track for each repo ---
    pgm.sql(`
      create table if not exists repo_refs (
        id bigserial primary key,
        repo_id bigint not null references repos(id) on delete cascade,
  
        ref_name text not null,                   -- e.g. 'main'
        ref_type text not null default 'branch',  -- 'branch' (future: tag/pr)
        head_sha text,
        last_fetched_at timestamptz,
  
        tracking boolean not null default true,
  
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
  
        unique (repo_id, ref_type, ref_name)
      );
    `);
  
    pgm.sql(`
      create index if not exists repo_refs_repo_idx
      on repo_refs(repo_id);
    `);
  
    // --- Zoekt index snapshots (versioned by commit sha) ---
    pgm.sql(`
      create table if not exists zoekt_index_snapshots (
        id bigserial primary key,
        repo_id bigint not null references repos(id) on delete cascade,
        ref_id bigint not null references repo_refs(id) on delete cascade,
  
        commit_sha text not null,
        index_path text not null,           -- e.g. ~/.neptune/zoekt/owner_repo/main/<sha>/
        status text not null,               -- building|ready|failed|stale
        error text,
  
        created_at timestamptz not null default now(),
        finished_at timestamptz
      );
    `);
  
    pgm.sql(`
      create index if not exists zoekt_snapshots_repo_status_idx
      on zoekt_index_snapshots(repo_id, status, created_at desc);
    `);
  
    pgm.sql(`
      create index if not exists zoekt_snapshots_ref_idx
      on zoekt_index_snapshots(ref_id, created_at desc);
    `);
  
    // --- Active index pointer (one per repo/ref) ---
    pgm.sql(`
      create table if not exists zoekt_active_index (
        repo_id bigint not null references repos(id) on delete cascade,
        ref_id bigint not null references repo_refs(id) on delete cascade,
        snapshot_id bigint not null references zoekt_index_snapshots(id) on delete cascade,
        primary key (repo_id, ref_id)
      );
    `);
  
    // --- Generic jobs table for background work ---
    pgm.sql(`
      create table if not exists jobs (
        id bigserial primary key,
  
        job_type text not null,     -- FETCH_REPO | BUILD_ZOEKT | GC_INDEX
        status text not null,       -- QUEUED | RUNNING | DONE | FAILED | CANCELED
        priority int not null default 100,
  
        repo_id bigint references repos(id) on delete cascade,
        ref_id bigint references repo_refs(id) on delete cascade,
  
        payload jsonb,
        progress int not null default 0,
        message text,
        error text,
  
        attempts int not null default 0,
  
        created_at timestamptz not null default now(),
        started_at timestamptz,
        finished_at timestamptz
      );
    `);
  
    pgm.sql(`
      create index if not exists jobs_status_priority_idx
      on jobs(status, priority, created_at);
    `);
  
    pgm.sql(`
      create index if not exists jobs_repo_status_idx
      on jobs(repo_id, status, created_at desc);
    `);
  
    // --- Repo sets (search contexts) ---
    pgm.sql(`
      create table if not exists repo_sets (
        id bigserial primary key,
        name text not null unique,            -- "All", "Work", etc.
        is_default boolean not null default false,
        created_at timestamptz not null default now()
      );
    `);
  
    pgm.sql(`
      create table if not exists repo_set_repos (
        repo_set_id bigint not null references repo_sets(id) on delete cascade,
        repo_id bigint not null references repos(id) on delete cascade,
        primary key (repo_set_id, repo_id)
      );
    `);
  
    pgm.sql(`
      create index if not exists repo_set_repos_repo_idx
      on repo_set_repos(repo_id);
    `);
  
    // --- Saved searches ---
    pgm.sql(`
      create table if not exists saved_searches (
        id bigserial primary key,
        name text not null,
        query text not null,
        created_at timestamptz not null default now()
      );
    `);
  
    // Seed default repo set "All" + app_state row (optional but helpful)
    // Safe/idempotent inserts:
    pgm.sql(`
      insert into repo_sets (name, is_default)
      values ('All', true)
      on conflict (name) do nothing;
    `);
  
    pgm.sql(`
      insert into app_state (id)
      values (1)
      on conflict (id) do nothing;
    `);
  
    // Point app_state.default_repo_set_id to "All" if not set yet
    pgm.sql(`
      update app_state
      set default_repo_set_id = (select id from repo_sets where name = 'All' limit 1)
      where id = 1 and default_repo_set_id is null;
    `);
  };
  
  exports.down = (pgm) => {
    // Drop in reverse dependency order
    pgm.sql(`drop table if exists saved_searches;`);
    pgm.sql(`drop table if exists repo_set_repos;`);
    pgm.sql(`drop table if exists repo_sets;`);
    pgm.sql(`drop table if exists jobs;`);
    pgm.sql(`drop table if exists zoekt_active_index;`);
    pgm.sql(`drop table if exists zoekt_index_snapshots;`);
    pgm.sql(`drop table if exists repo_refs;`);
    pgm.sql(`drop table if exists repos;`);
    pgm.sql(`drop table if exists github_identity;`);
    pgm.sql(`drop table if exists app_state;`);
  
    // Optional: keep extension (often shared). If you want a clean teardown:
    // pgm.sql(`drop extension if exists pg_trgm;`);
  };
  