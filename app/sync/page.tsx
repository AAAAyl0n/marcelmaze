"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  filterFiles,
  prepareFlashFiles,
  resolveManifest,
} from "../../src/lib/flashing/firmware";
import { flashWithEsptool } from "../../src/lib/flashing/esptool";
import {
  getActivePortInfo,
  hasWebSerialSupport,
  requiresSecureContext,
} from "../../src/lib/flashing/webserial";

interface FlashProgress {
  stage: string;
  current: number;
  total: number;
  percentage: number;
  message: string;
}

function SyncPageInner() {
  const params = useSearchParams();
  const env = params.get("env") || "UNKNOWN";
  const version = params.get("version") || "UNKNOWN";
  const portFromQuery = params.get("portLabel") || "UNKNOWN";
  const manifestUrl = params.get("manifestUrl") || "";
  const baseUrl = params.get("baseUrl") || "";
  const baud = Number.parseInt(params.get("baud") || "921600", 10);
  const includeLittleFS = params.get("includeLittleFS") === "1";

  const [progress, setProgress] = useState<FlashProgress | null>(null);
  const [logline, setLogline] = useState("AWAITING INITIALIZATION...");
  const [isFlashing, setIsFlashing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [portLabel, setPortLabel] = useState(portFromQuery);

  useEffect(() => {
    void (async () => {
      const info = await getActivePortInfo();
      setPortLabel(info);
    })();
  }, []);

  const webSerialBlocked = !hasWebSerialSupport() || requiresSecureContext();

  const pushProgress = (p: FlashProgress) => {
    setProgress(p);
    setLogline(p.message || "");
  };

  const start = async () => {
    if (!manifestUrl) return;
    if (webSerialBlocked) {
      setResult({ success: false, message: "当前环境不支持 Web Serial。" });
      return;
    }

    setIsFlashing(true);
    setProgress(null);
    setResult(null);
    setLogline("ESTABLISHING CONNECTION...");

    try {
      pushProgress({
        stage: "preparing",
        current: 0,
        total: 100,
        percentage: 2,
        message: "加载固件清单...",
      });

      const { manifest, baseUrl: resolvedBase } = await resolveManifest(manifestUrl);
      const files = filterFiles(manifest.files, includeLittleFS);
      if (files.length === 0) {
        throw new Error("没有可烧录文件，请检查 LittleFS 选项。");
      }

      pushProgress({
        stage: "preparing",
        current: 0,
        total: files.length,
        percentage: 6,
        message: "下载固件文件...",
      });

      const flashFiles = await prepareFlashFiles(baseUrl || resolvedBase, files);

      await flashWithEsptool(
        flashFiles,
        Number.isFinite(baud) ? baud : manifest.baud,
        (p) => {
          pushProgress(p);
        }
      );

      setResult({ success: true, message: "固件烧录成功" });
      const info = await getActivePortInfo();
      setPortLabel(info);
    } catch (e) {
      setResult({ success: false, message: String(e) });
      setLogline("CONNECTION FAILED");
    } finally {
      setIsFlashing(false);
    }
  };

  return (
    <div className="container-center">
      <div className="brutalist-card">
        <div className="header-bar">
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <button
              className="te-button-outline"
              onClick={() => window.history.back()}
              disabled={isFlashing}
              style={{ padding: "4px 12px", marginBottom: 0, width: "auto", minWidth: "100px" }}
            >
              <span>&lt; BACK</span>
            </button>
            <h1 className="header-title">HDD SYNC TERMINAL</h1>
          </div>
          <div className="header-status">
            <span>{isFlashing ? "UPLOADING" : "READY"}</span>
            <div
              className="status-dot"
              style={{
                background: isFlashing ? "var(--danger)" : "var(--accent)",
                boxShadow: isFlashing ? "0 0 8px var(--danger)" : "0 0 8px var(--accent)",
              }}
            ></div>
          </div>
        </div>

        <div className="card-content">
          <div className="terminal-display">
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">BANGBOO ENTITY</span>
                <span className="info-value">{env.toUpperCase()}</span>
              </div>
              <div className="info-item">
                <span className="info-label">FIRMWARE DATA</span>
                <span className="info-value">{version}</span>
              </div>
              <div className="info-item">
                <span className="info-label">ETHER CONNECTION</span>
                <span className="info-value">{portLabel}</span>
              </div>
              <div className="info-item">
                <span className="info-label">SYSTEM OVERRIDE (LITTLEFS)</span>
                <span
                  className="info-value"
                  style={{ color: includeLittleFS ? "var(--accent)" : "inherit" }}
                >
                  {includeLittleFS ? "ENABLED" : "DISABLED"}
                </span>
              </div>
            </div>

            <div className="terminal-log">
              <div style={{ opacity: 0.5 }}>&gt; INITIALIZING HDD SYSTEM...</div>
              <div style={{ opacity: 0.5 }}>&gt; VERIFYING PROXY PROFILES...</div>
              <div className="active-log">&gt; {logline}</div>
            </div>

            <div className="progress-container">
              <div className="progress-header">
                <span>{progress?.stage ? progress.stage.toUpperCase() : "AWAITING COMMAND"}</span>
                <span>{progress?.percentage?.toFixed(1) || "0.0"}%</span>
              </div>
              <div className="te-progress-bar">
                <div
                  className={`te-progress-fill ${isFlashing ? "animating" : "paused"}`}
                  style={{ width: `${progress?.percentage ?? 0}%` }}
                />
              </div>
            </div>
          </div>

          {result && (
            <div className={`result-message ${result.success ? "success" : "error"}`}>
              {result.success
                ? "[ COMMISSION COMPLETE : DATA SYNCED SUCCESSFULLY ]"
                : `[ ERROR : ${result.message.toUpperCase()} ]`}
            </div>
          )}

          {!result && (
            <button
              className="te-button-primary"
              onClick={start}
              disabled={isFlashing || !manifestUrl || webSerialBlocked}
            >
              <span>{isFlashing ? "SYNC IN PROGRESS..." : "START COMMISSION"}</span>
              <span>{isFlashing ? "///" : ">>"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SyncPage() {
  return (
    <Suspense
      fallback={
        <div className="container-center">
          <div className="header-title" style={{ color: "var(--accent)" }}>
            LOADING MODULE...
          </div>
        </div>
      }
    >
      <SyncPageInner />
    </Suspense>
  );
}