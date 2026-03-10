const SERIAL_PORT_FILTERS = [
  { usbVendorId: 0x303a },
  { usbVendorId: 0x10c4 },
  { usbVendorId: 0x1a86 },
];
let activePort: SerialPort | null = null;

export function hasWebSerialSupport(): boolean {
  return typeof window !== "undefined" && "serial" in navigator;
}

export function requiresSecureContext(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return !window.isSecureContext && window.location.hostname !== "localhost";
}

export async function requestAndOpenPort(baudRate: number): Promise<SerialPort> {
  void baudRate;
  if (!hasWebSerialSupport()) {
    throw new Error("当前浏览器不支持 Web Serial，请使用 Chrome/Edge。");
  }
  if (requiresSecureContext()) {
    throw new Error("Web Serial 需要 HTTPS 或 localhost。");
  }

  const port = await navigator.serial.requestPort({
    filters: SERIAL_PORT_FILTERS as SerialPortFilter[],
  });
  // Note: Do not call port.open() here. esptool-js will open via Transport.connect().
  activePort = port;
  return port;
}

export async function ensurePortOpen(baudRate: number): Promise<SerialPort> {
  void baudRate;
  const port = activePort;
  if (!port) {
    return requestAndOpenPort(baudRate);
  }
  return port;
}

export async function closeActivePort(): Promise<void> {
  const port = activePort;
  if (!port) return;
  try {
    await port.close();
  } catch {
    // 忽略已断开/已关闭异常
  } finally {
    activePort = null;
  }
}

export async function getActivePortInfo(): Promise<string> {
  const port = activePort;
  if (!port) return "NOT CONNECTED";

  try {
    const info = port.getInfo();
    const vid = info.usbVendorId ? info.usbVendorId.toString(16).padStart(4, "0") : "----";
    const pid = info.usbProductId ? info.usbProductId.toString(16).padStart(4, "0") : "----";
    return `USB VID:PID ${vid}:${pid}`;
  } catch {
    return "SERIAL PORT";
  }
}
