/**
 * Migration: Change repos unique constraint from full_name to (host_url, external_repo_id)
 * 
 * This allows the same full_name to exist across different hosts (e.g., github.com vs GHE)
 * while ensuring each repo is unique per host by its GitHub ID.
 */

exports.up = (pgm) => {
  // Drop the old unique constraint on full_name
  pgm.sql(`
    ALTER TABLE repos DROP CONSTRAINT IF EXISTS repos_full_name_key;
  `);

  // Drop the old unique index if it exists (some setups use index instead of constraint)
  pgm.sql(`
    DROP INDEX IF EXISTS repos_full_name_key;
  `);

  // Add new unique constraint on (host_url, external_repo_id)
  // This is the proper way to identify a repo: which host + what's its ID on that host
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS repos_host_external_id_idx 
    ON repos(host_url, external_repo_id);
  `);

  // Also add a non-unique index on full_name for fast lookups (still useful for search/display)
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS repos_full_name_idx 
    ON repos(full_name);
  `);
};

exports.down = (pgm) => {
  // Revert: drop the new indexes
  pgm.sql(`
    DROP INDEX IF EXISTS repos_host_external_id_idx;
  `);

  pgm.sql(`
    DROP INDEX IF EXISTS repos_full_name_idx;
  `);

  // Restore the old unique constraint on full_name
  pgm.sql(`
    ALTER TABLE repos ADD CONSTRAINT repos_full_name_key UNIQUE (full_name);
  `);
};

