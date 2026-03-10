import { FlashProgress, FlashableFile } from "./types";
import { closeActivePort, ensurePortOpen } from "./webserial";

type ProgressCb = (progress: FlashProgress) => void;

function bytesToBinaryString(bytes: Uint8Array): string {
  // esptool-js writeFlash expects binary string data, not Uint8Array
  let out = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    out += String.fromCharCode(...chunk);
  }
  return out;
}

async function loadEsptoolJs(): Promise<{ ESPLoader: any; Transport: any }> {
  const mod = (await import("esptool-js")) as {
    ESPLoader: any;
    Transport: any;
  };
  return { ESPLoader: mod.ESPLoader, Transport: mod.Transport };
}

function emit(
  cb: ProgressCb,
  stage: FlashProgress["stage"],
  percentage: number,
  message: string,
  current: number,
  total: number
): void {
  cb({
    stage,
    percentage: Math.max(0, Math.min(100, percentage)),
    message,
    current,
    total,
  });
}

export async function flashWithEsptool(
  files: FlashableFile[],
  baudRate: number,
  onProgress: ProgressCb
): Promise<void> {
  if (files.length === 0) {
    throw new Error("没有可烧录的文件。");
  }

  const { ESPLoader, Transport } = await loadEsptoolJs();
  const port = await ensurePortOpen(baudRate);
  // If previous attempts left the port opened, close first so Transport.connect can own lifecycle.
  if (port.readable || port.writable) {
    try {
      await port.close();
    } catch {
      // ignore close race and let Transport.connect handle errors
    }
  }
  const transport = new Transport(port, true);
  const loader = new ESPLoader({
    transport,
    baudrate: baudRate,
    terminal: {
      clean() {
        // no-op
      },
      writeLine(data: string) {
        // no-op
        void data;
      },
      write(data: string) {
        // no-op
        void data;
      },
    },
  });

  emit(onProgress, "connecting", 5, "连接设备...", 0, files.length);

  try {
    await loader.main();
    let current = 0;
    for (const file of files) {
      current += 1;
      emit(
        onProgress,
        "flashing",
        10 + ((current - 1) / files.length) * 85,
        `烧录 ${file.fileName} (${current}/${files.length})`,
        current,
        files.length
      );

      await loader.writeFlash({
        fileArray: [
          {
            data: bytesToBinaryString(file.bytes),
            address: file.offset,
          },
        ],
        flashSize: "keep",
        flashMode: "dio",
        flashFreq: "80m",
        eraseAll: false,
        compress: true,
        reportProgress: (fileIndex: number, written: number, total: number) => {
          void fileIndex;
          const part = total > 0 ? written / total : 0;
          const overall = 10 + ((current - 1 + part) / files.length) * 85;
          emit(
            onProgress,
            "flashing",
            overall,
            `${file.fileName}: ${(part * 100).toFixed(0)}%`,
            current,
            files.length
          );
        },
      });
    }

    emit(onProgress, "completed", 100, "烧录完成！", files.length, files.length);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit(onProgress, "error", 100, `烧录失败: ${message}`, 0, files.length);
    throw error;
  } finally {
    await closeActivePort();
  }
}
