export type EnvKey = string;

export interface FlashFile {
  offset: string;
  path: string;
  fs?: string;
}

export interface FirmwareManifest {
  name: string;
  version: string;
  env: string;
  chip: string;
  flash_size: string;
  baud: number;
  flash_mode: string;
  flash_freq: string;
  erase_flash: boolean;
  files: FlashFile[];
}

export interface FirmwareInfo {
  env: string;
  version: string;
  name: string;
  chip: string;
  flash_size: string;
  baud: number;
  manifestUrl: string;
  baseUrl: string;
}

export interface FirmwareIndexEntry {
  env: string;
  version: string;
  manifestPath: string;
  basePath?: string;
  cdnManifestUrl?: string;
  cdnBaseUrl?: string;
}

export interface FirmwareIndex {
  staticBasePath: string;
  cdnBaseUrl?: string;
  firmwares: FirmwareIndexEntry[];
}

export interface FlashableFile {
  offset: number;
  addressHex: string;
  fileName: string;
  bytes: Uint8Array;
}

export interface FlashProgress {
  stage: "preparing" | "connecting" | "flashing" | "completed" | "error";
  current: number;
  total: number;
  percentage: number;
  message: string;
}
