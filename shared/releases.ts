export const GITHUB_REPOSITORY_OWNER = "4gray";
export const GITHUB_REPOSITORY_NAME = "time-bro";
export const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPOSITORY_OWNER}/${GITHUB_REPOSITORY_NAME}/releases`;
export const GITHUB_LATEST_RELEASE_API_URL =
  `https://api.github.com/repos/${GITHUB_REPOSITORY_OWNER}/${GITHUB_REPOSITORY_NAME}/releases/latest`;
export const GITHUB_RELEASES_API_URL =
  `https://api.github.com/repos/${GITHUB_REPOSITORY_OWNER}/${GITHUB_REPOSITORY_NAME}/releases?per_page=100`;
export const GITHUB_RAW_MAIN_URL =
  `https://raw.githubusercontent.com/${GITHUB_REPOSITORY_OWNER}/${GITHUB_REPOSITORY_NAME}/main/`;

const COMPARABLE_VERSION_PATTERN = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/i;

export const normalizeReleaseVersion = (version: string) => version.trim().replace(/^v/i, "");

const parseComparableVersion = (version: string) => {
  const match = normalizeReleaseVersion(version).match(COMPARABLE_VERSION_PATTERN);

  if (!match) {
    return undefined;
  }

  return [
    Number.parseInt(match[1] ?? "0", 10),
    Number.parseInt(match[2] ?? "0", 10),
    Number.parseInt(match[3] ?? "0", 10)
  ];
};

export const isNewerReleaseVersion = (latestVersion: string, currentVersion: string) => {
  const latestParts = parseComparableVersion(latestVersion);
  const currentParts = parseComparableVersion(currentVersion);

  if (!latestParts || !currentParts) {
    return false;
  }

  for (let index = 0; index < latestParts.length; index += 1) {
    if (latestParts[index] > currentParts[index]) {
      return true;
    }

    if (latestParts[index] < currentParts[index]) {
      return false;
    }
  }

  return false;
};

export const getSafeReleaseAssetUrl = (candidateUrl?: string) => {
  if (!candidateUrl) {
    return undefined;
  }

  try {
    const url = new URL(candidateUrl);
    const allowedPath = `/${GITHUB_REPOSITORY_OWNER}/${GITHUB_REPOSITORY_NAME}/releases`;

    if (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      (url.pathname === allowedPath || url.pathname.startsWith(`${allowedPath}/`))
    ) {
      return url.toString();
    }
  } catch {
    /* fall through to the public releases page */
  }

  return undefined;
};

export const getSafeReleaseUrl = (candidateUrl?: string) => {
  const safeUrl = getSafeReleaseAssetUrl(candidateUrl);
  if (safeUrl) {
    return safeUrl;
  }

  return GITHUB_RELEASES_URL;
};
