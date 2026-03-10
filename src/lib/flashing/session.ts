let activePort: SerialPort | null = null;

export function setActivePort(port: SerialPort | null): void {
  activePort = port;
}

export function getActivePort(): SerialPort | null {
  return activePort;
}

export function clearActivePort(): void {
  activePort = null;
}
