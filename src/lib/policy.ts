export const ignoredDirNames = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "vendor",
  "target",
  ".turbo",
  ".audit-kit"
] as const;

export const ignoredGlobs = ignoredDirNames.map((dir) => `**/${dir}/**`);

export const lockfileNames = [
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb"
] as const;
