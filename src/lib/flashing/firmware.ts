import {
  FirmwareIndex,
  FirmwareInfo,
  FirmwareManifest,
  FlashFile,
  FlashableFile,
} from "./types";

const DEFAULT_INDEX_URL = "/firmware/index.json";

function toAbsoluteUrl(pathOrUrl: string): string {
  const input = pathOrUrl.trim();
  if (!input) {
    return "/";
  }
  if (input.startsWith("http://") || input.startsWith("https://")) {
    return input;
  }
  return input.startsWith("/") ? input : `/${input}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`请求失败 ${res.status}: ${url}`);
  }
  return (await res.json()) as T;
}

function normalizeUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const base = baseUrl.trim();
  if (base.startsWith("http://") || base.startsWith("https://")) {
    return new URL(normalizedPath, base.endsWith("/") ? base : `${base}/`).toString();
  }

  const basePath = base || "/";
  const joinedBase = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  return `${joinedBase}/${normalizedPath}`;
}

async function loadManifestWithFallback(
  staticManifestUrl: string,
  cdnManifestUrl?: string
): Promise<{ manifest: FirmwareManifest; manifestUrl: string; baseUrl: string }> {
  try {
    const manifest = await fetchJson<FirmwareManifest>(staticManifestUrl);
    const baseUrl = staticManifestUrl.slice(0, staticManifestUrl.lastIndexOf("/") + 1);
    return { manifest, manifestUrl: staticManifestUrl, baseUrl };
  } catch (e) {
    if (!cdnManifestUrl) {
      throw e;
    }
  }

  const manifest = await fetchJson<FirmwareManifest>(cdnManifestUrl as string);
  const baseUrl = (cdnManifestUrl as string).slice(0, (cdnManifestUrl as string).lastIndexOf("/") + 1);
  return { manifest, manifestUrl: cdnManifestUrl as string, baseUrl };
}

export async function listFirmware(indexUrl = DEFAULT_INDEX_URL): Promise<FirmwareInfo[]> {
  const index = await fetchJson<FirmwareIndex>(indexUrl);
  const cdnBase = index.cdnBaseUrl ?? process.env.NEXT_PUBLIC_FIRMWARE_CDN_BASE;

  const results = (
    await Promise.all(
      index.firmwares.map(async (entry) => {
        try {
      const staticBase = toAbsoluteUrl(entry.basePath ?? index.staticBasePath);
      const staticManifestUrl = normalizeUrl(staticBase, entry.manifestPath);

      const cdnBaseUrl = entry.cdnBaseUrl ?? cdnBase;
      const cdnManifestUrl = entry.cdnManifestUrl
        ? toAbsoluteUrl(entry.cdnManifestUrl)
        : cdnBaseUrl
          ? normalizeUrl(cdnBaseUrl, `${entry.env}/${entry.version}/manifest.json`)
          : undefined;

      const { manifest, manifestUrl, baseUrl } = await loadManifestWithFallback(
        staticManifestUrl,
        cdnManifestUrl
      );

      return {
        env: entry.env,
        version: entry.version,
        name: manifest.name,
        chip: manifest.chip,
        flash_size: manifest.flash_size,
        baud: manifest.baud,
        manifestUrl,
        baseUrl,
      } satisfies FirmwareInfo;
        } catch {
          return null;
        }
      })
    )
  ).filter((item): item is FirmwareInfo => item !== null);

  if (results.length === 0) {
    throw new Error("没有可用固件，请检查 public/firmware/index.json 与 manifest 文件。");
  }

  return results.sort((a, b) => {
    if (a.env === b.env) {
      return a.version.localeCompare(b.version);
    }
    return a.env.localeCompare(b.env);
  });
}

export async function resolveManifest(
  manifestUrl: string,
  fallbackManifestUrl?: string
): Promise<{ manifest: FirmwareManifest; baseUrl: string }> {
  const { manifest, baseUrl } = await loadManifestWithFallback(manifestUrl, fallbackManifestUrl);
  return { manifest, baseUrl };
}

export function filterFiles(files: FlashFile[], includeLittleFS: boolean): FlashFile[] {
  return files.filter((file) => {
    if ((file.fs ?? "").toLowerCase() === "littlefs") {
      return includeLittleFS;
    }
    return true;
  });
}

function parseAddress(offset: string): number {
  const normalized = offset.startsWith("0x") ? offset : `0x${offset}`;
  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) {
    throw new Error(`无效 offset: ${offset}`);
  }
  return value;
}

export async function prepareFlashFiles(
  baseUrl: string,
  files: FlashFile[]
): Promise<FlashableFile[]> {
  const prepared = await Promise.all(
    files.map(async (file) => {
      const fileUrl = normalizeUrl(baseUrl, file.path);
      const res = await fetch(fileUrl, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`固件文件下载失败 ${res.status}: ${fileUrl}`);
      }
      const buffer = await res.arrayBuffer();
      return {
        offset: parseAddress(file.offset),
        addressHex: file.offset.startsWith("0x") ? file.offset : `0x${file.offset}`,
        fileName: file.path,
        bytes: new Uint8Array(buffer),
      } satisfies FlashableFile;
    })
  );

  return prepared.sort((a, b) => a.offset - b.offset);
}
