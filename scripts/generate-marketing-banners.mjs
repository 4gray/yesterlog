import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "docs", "media");
const iconPath = path.join(root, "docs", "app-icon.png");
const weekScreenshotPath = path.join(
  root,
  "docs",
  "screenshots",
  "v2.4.0",
  "dark-week.png",
);

const assets = {
  snap: {
    background: path.join(
      root,
      "assets",
      "marketing",
      "snap-featured-background.png",
    ),
    output: path.join(outputDirectory, "timebro-snap-featured-banner.png"),
    width: 2160,
    height: 720,
    maxBytes: 2_000_000,
  },
  github: {
    background: path.join(
      root,
      "assets",
      "marketing",
      "github-social-background.png",
    ),
    output: path.join(outputDirectory, "timebro-github-social-preview.png"),
    width: 1280,
    height: 640,
    maxBytes: 1_000_000,
  },
};

function svgBuffer(width, height, body) {
  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
      xmlns="http://www.w3.org/2000/svg">
      ${body}
    </svg>
  `);
}

async function roundedImage(input, width, height, radius) {
  const resized = await sharp(input)
    .resize(width, height, { fit: "cover", position: "north" })
    .png()
    .toBuffer();
  const mask = svgBuffer(
    width,
    height,
    `<rect width="${width}" height="${height}" rx="${radius}" fill="#fff" />`,
  );

  return sharp(resized)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function panelShadow(width, height, radius) {
  return sharp(
    svgBuffer(
      width,
      height,
      `<defs>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="24" />
        </filter>
      </defs>
      <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="${radius}"
        fill="#000" fill-opacity=".7" filter="url(#shadow)" />`,
    ),
  )
    .png()
    .toBuffer();
}

function snapTypography() {
  return svgBuffer(
    assets.snap.width,
    assets.snap.height,
    `<defs>
      <linearGradient id="copyShade" x1="0" x2="1">
        <stop offset="0" stop-color="#100f0c" stop-opacity=".62" />
        <stop offset=".75" stop-color="#100f0c" stop-opacity=".08" />
        <stop offset="1" stop-color="#100f0c" stop-opacity="0" />
      </linearGradient>
    </defs>
    <rect width="1060" height="720" fill="url(#copyShade)" />
    <text x="260" y="170" fill="#f5f3f0"
      font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="76"
      font-weight="700" letter-spacing="-3">Time<tspan fill="#6f93ff">Bro</tspan></text>
    <text x="120" y="334" fill="#f5f3f0"
      font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="72"
      font-weight="700" letter-spacing="-2.5">Your whole week.</text>
    <text x="120" y="420" fill="#8fabff"
      font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="68"
      font-weight="600" letter-spacing="-2.2">Every gap. One window.</text>
    <text x="120" y="500" fill="#b7b4ad"
      font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="29"
      font-weight="500" letter-spacing="-.35">Local-first Jira time tracking on your desktop.</text>`,
  );
}

function githubTypography() {
  return svgBuffer(
    assets.github.width,
    assets.github.height,
    `<defs>
      <linearGradient id="copyShade" x1="0" x2="1">
        <stop offset="0" stop-color="#100f0c" stop-opacity=".7" />
        <stop offset=".72" stop-color="#100f0c" stop-opacity=".12" />
        <stop offset="1" stop-color="#100f0c" stop-opacity="0" />
      </linearGradient>
    </defs>
    <rect width="720" height="640" fill="url(#copyShade)" />
    <text x="178" y="123" fill="#f5f3f0"
      font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="58"
      font-weight="700" letter-spacing="-2.4">Time<tspan fill="#6f93ff">Bro</tspan></text>
    <text x="72" y="278" fill="#f5f3f0"
      font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="66"
      font-weight="700" letter-spacing="-2.6">Your whole week.</text>
    <text x="72" y="352" fill="#8fabff"
      font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="50"
      font-weight="600" letter-spacing="-1.8">Every gap. One window.</text>
    <text x="72" y="422" fill="#b7b4ad"
      font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="27"
      font-weight="500" letter-spacing="-.35">Local-first Jira time tracking.</text>`,
  );
}

async function renderSnapBanner() {
  const screenshot = await roundedImage(weekScreenshotPath, 900, 625, 18);
  const shadow = await panelShadow(900, 625, 18);
  const icon = await sharp(iconPath).resize(112, 112).png().toBuffer();

  await sharp(assets.snap.background)
    .resize(assets.snap.width, assets.snap.height, { fit: "cover" })
    .composite([
      { input: snapTypography(), left: 0, top: 0 },
      { input: icon, left: 120, top: 88 },
      { input: shadow, left: 1160, top: 95 },
      { input: screenshot, left: 1160, top: 95 },
    ])
    .png({ compressionLevel: 9, palette: true, quality: 94, colours: 256 })
    .toFile(assets.snap.output);
}

async function renderGithubPreview() {
  const screenshot = await roundedImage(weekScreenshotPath, 640, 444, 16);
  const shadow = await panelShadow(640, 444, 16);
  const icon = await sharp(iconPath).resize(88, 88).png().toBuffer();

  await sharp(assets.github.background)
    .resize(assets.github.width, assets.github.height, { fit: "cover" })
    .composite([
      { input: githubTypography(), left: 0, top: 0 },
      { input: icon, left: 72, top: 52 },
      { input: shadow, left: 640, top: 196 },
      { input: screenshot, left: 640, top: 196 },
    ])
    .png({ compressionLevel: 9, palette: true, quality: 92, colours: 256 })
    .toFile(assets.github.output);
}

async function validateAsset(name, asset) {
  const metadata = await sharp(asset.output).metadata();
  const file = await stat(asset.output);

  if (metadata.width !== asset.width || metadata.height !== asset.height) {
    throw new Error(
      `${name} dimensions are ${metadata.width}x${metadata.height}; expected ${asset.width}x${asset.height}`,
    );
  }
  if (file.size > asset.maxBytes) {
    throw new Error(
      `${name} is ${file.size} bytes; limit is ${asset.maxBytes} bytes`,
    );
  }

  console.log(`${name}: ${metadata.width}x${metadata.height}, ${file.size} bytes`);
}

await mkdir(outputDirectory, { recursive: true });
await renderSnapBanner();
await renderGithubPreview();
await validateAsset("Snap featured banner", assets.snap);
await validateAsset("GitHub social preview", assets.github);
