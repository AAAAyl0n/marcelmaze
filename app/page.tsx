"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { listFirmware } from "../src/lib/flashing/firmware";
import {
  getActivePortInfo,
  hasWebSerialSupport,
  requestAndOpenPort,
  requiresSecureContext,
} from "../src/lib/flashing/webserial";
import { EnvKey, FirmwareInfo } from "../src/lib/flashing/types";

const ENV_LABELS: Record<string, string> = {
  eous: "Eous",
  amillion: "Amillion",
  paperboo: "Paperboo",
};

export default function Page() {
  const router = useRouter();
  const [firmwareList, setFirmwareList] = useState<FirmwareInfo[]>([]);

  const [env, setEnv] = useState<EnvKey | null>(null);
  const [version, setVersion] = useState<string>("");
  const [includeLittleFS, setIncludeLittleFS] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [portLabel, setPortLabel] = useState<string>("NOT CONNECTED");
  const [error, setError] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  const [serialUnsupported, setSerialUnsupported] = useState(false);
  const [insecureContext, setInsecureContext] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSerialUnsupported(!hasWebSerialSupport());
    setInsecureContext(requiresSecureContext());
    loadFirmware();
  }, []);

  const loadFirmware = async () => {
    try {
      const list = await listFirmware();
      setFirmwareList(list);
      setError("");
    } catch (e) {
      setError(`固件索引加载失败: ${String(e)}`);
    }
  };

  const envVersions = useMemo(() => {
    if (!env) return [] as string[];
    const set = new Set<string>();
    firmwareList
      .filter((f) => f.env.toLowerCase() === env)
      .forEach((f) => set.add(f.version));
    return Array.from(set).sort();
  }, [env, firmwareList]);

  const envOptions = useMemo(() => {
    const envs = Array.from(new Set(firmwareList.map((f) => f.env.toLowerCase()))).sort();
    return envs.map((key, idx) => ({
      key,
      label: ENV_LABELS[key] ?? key.toUpperCase(),
      id: String(idx + 1).padStart(2, "0"),
    })) as { key: EnvKey; label: string; id: string }[];
  }, [firmwareList]);

  useEffect(() => {
    if (envOptions.length === 0) {
      setEnv(null);
      return;
    }
    setEnv((prev) => (prev && envOptions.some((o) => o.key === prev) ? prev : envOptions[0].key));
  }, [envOptions]);

  useEffect(() => {
    if (envVersions.length > 0) {
      setVersion((v) => (v && envVersions.includes(v) ? v : envVersions[0]));
    } else {
      setVersion("");
    }
  }, [envVersions]);

  const selectedFirmware = useMemo(() => {
    if (!env || !version) return undefined;
    return firmwareList.find(
      (f) => f.env.toLowerCase() === env && f.version === version
    );
  }, [env, version, firmwareList]);

  const goNext = () => {
    if (!env || !version || !selectedFirmware) return;
    const q = new URLSearchParams({
      env,
      version,
      portLabel,
      manifestUrl: selectedFirmware.manifestUrl,
      baseUrl: selectedFirmware.baseUrl,
      baud: String(selectedFirmware.baud),
      includeLittleFS: includeLittleFS ? "1" : "0",
    }).toString();
    router.push(`/sync?${q}`);
  };

  const connectPort = async () => {
    if (!selectedFirmware) return;
    if (serialUnsupported || insecureContext) {
      return;
    }

    setIsConnecting(true);
    setError("");
    try {
      await requestAndOpenPort(selectedFirmware.baud || 921600);
      const info = await getActivePortInfo();
      setPortLabel(info);
    } catch (e) {
      setError(`串口连接失败: ${String(e)}`);
      setPortLabel("NOT CONNECTED");
    } finally {
      setIsConnecting(false);
    }
  };

  const defaultConnectionHint =
    "> 将邦布用TYPE-C连接计算机，点击CONNECT，选择USB JTAG/Serial debug unit并点击连接";
  const runtimeConnectionHint = serialUnsupported
    ? "当前浏览器不支持 Web Serial，请使用 Chrome/Edge。"
    : insecureContext
      ? "当前上下文不安全，请通过 HTTPS 或 localhost 访问。"
      : error;
  const connectionHintText =
    mounted && runtimeConnectionHint ? runtimeConnectionHint : defaultConnectionHint;
  const showConnectionHint =
    portLabel === "NOT CONNECTED" || Boolean(mounted && runtimeConnectionHint);
  const connectionHintColor =
    mounted && runtimeConnectionHint ? "var(--accent)" : "var(--fg-muted)";

  return (
    <div className="container-center">
      <div className="brutalist-card">
        {/* Header */}
        <div className="header-bar">
          <h1 className="header-title">HOLLOW DEEP DIVE // CONFIG</h1>
          <div className="header-status">
            <span>SYS.ONLINE</span>
            <div className="status-dot"></div>
          </div>
        </div>

        <div className="card-content">
          {envOptions.length > 1 ? (
            <>
              {/* Target Entity */}
              <div className="section-label">01. BANGBOO SELECTION</div>
              <div className="grid-options">
                {envOptions.map(({ key, label, id }) => (
                  <label
                    key={key}
                    className={`te-option ${env === key ? "selected" : ""}`}
                    onClick={() => setEnv(key)}
                  >
                    <input
                      type="radio"
                      name="env"
                      value={key}
                      checked={env === key}
                      onChange={() => setEnv(key)}
                    />
                    <div className="option-id">ID:{id}</div>
                    <div className="option-label">{label}</div>
                  </label>
                ))}
              </div>

              {/* Firmware Build */}
              <div className="section-label">02. FIRMWARE DATA</div>
              <select
                className="te-input"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                disabled={!env || envVersions.length === 0}
              >
                {envVersions.length === 0 ? (
                  <option value="">AWAITING TARGET SELECTION...</option>
                ) : (
                  envVersions.map((v) => (
                    <option key={v} value={v}>
                      BUILD_VER: {v}
                    </option>
                  ))
                )}
              </select>
            </>
          ) : (
            <>
              <div className="section-label">01. COMMISSION TARGET</div>
              <div className="te-input" style={{ cursor: "default", display: "flex", justifyContent: "space-between", marginBottom: "32px" }}>
                <span>BANGBOO: <span style={{color: "var(--fg-main)"}}>{envOptions[0]?.label || "LOADING..."}</span></span>
                <span>BUILD: <span style={{color: "var(--fg-main)"}}>{version || "..."}</span></span>
              </div>
            </>
          )}

          {/* I/O Interface */}
          <div className="section-label">{envOptions.length > 1 ? "03" : "02"}. ETHER CONNECTION</div>
          <div className="flex-row" style={{ marginBottom: "16px" }}>
            <input
              className="te-input"
              style={{ marginBottom: 0, flex: 1 }}
              value={portLabel}
              readOnly
            />
            <button
              className="te-button-outline"
              onClick={connectPort}
              disabled={!selectedFirmware || isConnecting || serialUnsupported || insecureContext}
            >
              <span>{isConnecting ? "CONNECTING..." : "CONNECT"}</span>
            </button>
          </div>
          <div
            style={{
              color: connectionHintColor,
              fontSize: "12px",
              marginBottom: "16px",
              fontFamily: "var(--font-mono)",
              lineHeight: "18px",
              height: "54px",
              overflow: "hidden",
              visibility: showConnectionHint ? "visible" : "hidden",
            }}
          >
            {connectionHintText}
          </div>

          {/* System Options */}
          <div className="section-label" style={{ marginTop: "auto" }}>{envOptions.length > 1 ? "04" : "03"}. SYSTEM OVERRIDE</div>
          <label className="te-checkbox-wrapper" style={{ marginBottom: "16px" }}>
            <input
              type="checkbox"
              className="te-checkbox"
              checked={includeLittleFS}
              onChange={(e) => setIncludeLittleFS(e.target.checked)}
            />
            <span>INITIALIZE LITTLEFS VOLUME (WARNING: OVERWRITES DATA)</span>
          </label>

          {/* Action */}
          <button
            className="te-button-primary"
            onClick={goNext}
            disabled={
              !env ||
              !version ||
              !selectedFirmware ||
              portLabel === "NOT CONNECTED" ||
              serialUnsupported ||
              insecureContext
            }
          >
            <span>DIVE INTO THE HOLLOW</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}