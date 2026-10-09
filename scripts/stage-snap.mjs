import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Arch, Platform, build } from "electron-builder";

const projectDir = process.cwd();
const snapcraftProject = resolve(projectDir, "release", "__snap-amd64");
const snapcraftYaml = resolve(snapcraftProject, "snap", "snapcraft.yaml");
const packageJson = JSON.parse(
  await readFile(resolve(projectDir, "package.json"), "utf8"),
);
const sourceCodeUrl = packageJson.repository.url.replace(/\.git$/, "");
let snapDescriptor;

await build({
  projectDir,
  targets: Platform.LINUX.createTarget(["snap"], Arch.x64),
  publish: "never",
  effectiveOptionComputed: async (options) => {
    if (!options.snap) {
      return false;
    }

    snapDescriptor = options.snap;
    return true;
  },
});

if (!snapDescriptor) {
  throw new Error("electron-builder did not compute Snap packaging options");
}

// electron-builder 26.15.3 points apps.desktop at the final installed
// meta/gui path. The source already lives in snap/gui; Snapcraft discovers
// it there automatically and rewrites its Exec entry for the installed snap.
for (const [name, app] of Object.entries(snapDescriptor.apps)) {
  await access(resolve(snapcraftProject, "snap", "gui", `${name}.desktop`));
  delete app.desktop;
}

// JSON is valid YAML, and preserves the generated descriptor without relying
// on electron-builder's transitive YAML serializer.
await writeFile(
  snapcraftYaml,
  JSON.stringify({
    ...snapDescriptor,
    license: packageJson.license,
    contact: packageJson.bugs.url,
    issues: packageJson.bugs.url,
    "source-code": sourceCodeUrl,
    website: packageJson.homepage,
  }, null, 2) + "\n",
);
console.log(`Snapcraft project staged at ${snapcraftProject}`);
