"use client";
import React, { useState, useEffect, useRef } from "react";

// ASCII 背景（深暗红色字体），基于“chaos”模式
const patterns = {
  chaos: (x: number, y: number, t: number) => {
    const noise1 = Math.sin(x * 0.5 + t) * Math.cos(y * 0.3 - t);
    const noise2 = Math.sin(y * 0.4 + t * 0.5) * Math.cos(x * 0.2 + t * 0.7);
    const noise3 = Math.sin((x + y) * 0.2 + t * 0.8);
    return noise1 * 0.3 + noise2 * 0.3 + noise3 * 0.4;
  },
};

export default function AsciiChaos() {
  const [frame, setFrame] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mouseDown, setMouseDown] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 动态根据视口大小填满整屏
  const FONT_SIZE = 18; // px
  const CHAR_W = FONT_SIZE * 0.62 + 0.5; // 估算字符宽度（含 letter-spacing）
  const CHAR_H = FONT_SIZE * 0.8; // 与 line-height 对齐
  const [grid, setGrid] = useState({ cols: 80, rows: 45 });
  const slowdownFactor = 6;

  useEffect(() => {
    let animationId: number | undefined;
    const animate = () => {
      setFrame((f) => (f + 1) % (240 * slowdownFactor));
      animationId = requestAnimationFrame(animate);
    };
    animationId = requestAnimationFrame(animate);
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, []);

  // 根据容器/窗口尺寸动态计算网格，使 ASCII 覆盖整个可视区域
  useEffect(() => {
    const recompute = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      const w = rect?.width ?? window.innerWidth;
      const h = rect?.height ?? window.innerHeight;
      const cols = Math.ceil(w / CHAR_W);
      const rows = Math.ceil(h / CHAR_H);
      setGrid((g) => (g.cols === cols && g.rows === rows ? g : { cols, rows }));
    };
    recompute();
    const ro = new ResizeObserver(() => recompute());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("resize", recompute);
      if (containerRef.current) ro.disconnect();
    };
  }, []);

  const generateAsciiArt = () => {
    const t = (frame * Math.PI) / (60 * slowdownFactor);
    const currentPattern = patterns.chaos;
    let result = "";
    for (let y = 0; y < grid.rows; y++) {
      for (let x = 0; x < grid.cols; x++) {
        let value = currentPattern(x, y, t);
        if (mouseDown && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const dx = x - (((mousePos.x - rect.left) / rect.width) * grid.cols);
          const dy = y - (((mousePos.y - rect.top) / rect.height) * grid.rows);
          const dist = Math.sqrt(dx * dx + dy * dy);
          const mouseInfluence = Math.exp(-dist * 0.1) * Math.sin(t * 2);
          value += mouseInfluence * 0.8;
        }
        if (value > 0.6) result += "@";
        else if (value > 0.4) result += "0";
        else if (value > 0.2) result += "/";
        else if (value > 0.0) result += "=";
        else if (value > -0.2) result += "-";
        else if (value > -0.4) result += ".";
        else result += " ";
      }
      result += "\n";
    }
    return result;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };
  const handleMouseDown = () => setMouseDown(true);
  const handleMouseUp = () => setMouseDown(false);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      style={{
        position: "fixed",
        inset: 0,
        background: "transparent",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      <pre
        style={{
          fontFamily: "monospace",
          fontSize: `${FONT_SIZE}px`,
          lineHeight: "0.8",
          letterSpacing: "0.05em",
          color: "rgba(255, 79, 0, 0.15)", // TE Orange
          userSelect: "none",
          margin: 0,
          padding: 0,
        }}
      >
        {generateAsciiArt()}
      </pre>
    </div>
  );
}

// 根据窗口大小重算网格
// 使用 effect 监听 resize
// 放在组件定义底部以保持清晰
AsciiChaos.prototype = {} as any;



