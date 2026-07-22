import { access, appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Arch, Platform, build } from "electron-builder";

const projectDir = process.cwd();
const snapcraftProject = resolve(projectDir, "release", "__snap-amd64");
const snapcraftYaml = resolve(snapcraftProject, "snap", "snapcraft.yaml");
const packageJson = JSON.parse(
  await readFile(resolve(projectDir, "package.json"), "utf8"),
);
const sourceCodeUrl = packageJson.repository.url.replace(/\.git$/, "");
let snapOptionsComputed = false;

await build({
  projectDir,
  targets: Platform.LINUX.createTarget(["snap"], Arch.x64),
  publish: "never",
  effectiveOptionComputed: async (options) => {
    if (!options.snap) {
      return false;
    }

    snapOptionsComputed = true;
    return true;
  },
});

if (!snapOptionsComputed) {
  throw new Error("electron-builder did not compute Snap packaging options");
}

await access(snapcraftYaml);
await appendFile(
  snapcraftYaml,
  [
    "",
    `license: ${JSON.stringify(packageJson.license)}`,
    `contact: ${JSON.stringify(packageJson.bugs.url)}`,
    `issues: ${JSON.stringify(packageJson.bugs.url)}`,
    `source-code: ${JSON.stringify(sourceCodeUrl)}`,
    `website: ${JSON.stringify(sourceCodeUrl)}`,
    "",
  ].join("\n"),
);
console.log(`Snapcraft project staged at ${snapcraftProject}`);
