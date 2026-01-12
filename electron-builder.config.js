/**
 * @type {import('electron-builder').Configuration}
 */
const config = {
  appId: "com.example.app",
  asar: true,

  directories: {
    buildResources: "public",
    output: "dist",
  },

  files: [
    "app/**/*",
    "package.json",
  ],

  extraResources: [
    { from: "vendor/tooling/tools/", to: "tools/", filter: ["**/*"] },
  ],

  publish: null,

  win: {
    icon: "public/icon.ico",
    target: [{ target: "nsis", arch: ["x64"] }],
  },

  linux: {
    target: [
      { target: "deb", arch: ["x64"] },
      { target: "AppImage", arch: ["x64"] },
    ],
  },
};

module.exports = config;
