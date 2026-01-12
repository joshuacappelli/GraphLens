exports.up = (pgm) => {
  pgm.addColumns("repos", {
    clone_url_https: {
      type: "text",
      notNull: true,
      default: "",
    },
    clone_url_ssh: {
      type: "text",
      notNull: true,
      default: "",
    },
    clone_preference: {
      type: "text",
      notNull: true,
      default: "https",
    },
  });

  // Seed the legacy data with what we already stored in clone_url
  pgm.sql(`
    UPDATE repos
    SET
      clone_url_https = COALESCE(NULLIF(clone_url, ''), clone_url_https),
      clone_url_ssh = COALESCE(NULLIF(clone_url, ''), clone_url_ssh)
  `);
};

exports.down = (pgm) => {
  pgm.dropColumns("repos", ["clone_url_https", "clone_url_ssh", "clone_preference"]);
};
