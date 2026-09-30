"use client";

import { useEffect, useRef, useState } from "react";
import { Snowflake } from "lucide-react";
import { Switch } from "@/components/ui/switch";

const storageKey = "codex-pulse:snow:v1";
type Flake = { x: number; y: number; radius: number; speed: number };

export default function SnowToggle() {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(storageKey); } catch { /* Keep the switch usable without storage. */ }
    setEnabled(saved === "on" || (saved !== "off" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches));
    setReady(true);
    function sync(event: StorageEvent) {
      if (event.key !== storageKey && event.key !== null) return;
      setEnabled(event.newValue === "on" || (event.newValue !== "off" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches));
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!enabled || !canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let width = 0;
    let height = 0;
    let flakes: Flake[] = [];
    let frame = 0;
    let previous = 0;

    function resize() {
      if (!canvas || !context) return;
      width = window.innerWidth;
      height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      flakes = Array.from({ length: 100 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 3,
        speed: 30 + Math.random() * 120,
      }));
    }

    function draw(timestamp: number) {
      if (!context) return;
      const delta = previous ? Math.min((timestamp - previous) / 1000, 0.05) : 0;
      previous = timestamp;
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#fff";
      context.beginPath();
      for (const flake of flakes) {
        flake.y += flake.speed * delta;
        if (flake.y > height) { flake.y = -10; flake.x = Math.random() * width; }
        context.moveTo(flake.x + flake.radius, flake.y);
        context.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
      }
      context.fill();
      frame = window.requestAnimationFrame(draw);
    }

    function visibilityChanged() {
      window.cancelAnimationFrame(frame);
      previous = 0;
      if (!document.hidden) frame = window.requestAnimationFrame(draw);
    }

    resize();
    visibilityChanged();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visibilityChanged);
      context.clearRect(0, 0, width, height);
    };
  }, [enabled]);

  function toggle(next: boolean) {
    setEnabled(next);
    try { localStorage.setItem(storageKey, next ? "on" : "off"); } catch { /* The current page still switches. */ }
  }

  return <>
    {enabled && <canvas ref={canvasRef} className="snow-canvas" aria-hidden="true" />}
    <div className="snow-control" data-enabled={enabled} title={enabled ? "关闭雪花特效" : "开启雪花特效"}>
      <label htmlFor="pulse-snow-switch"><Snowflake size={16} aria-hidden="true" /><span>雪花</span></label>
      <Switch id="pulse-snow-switch" className="snow-switch" checked={enabled} onCheckedChange={toggle} disabled={!ready} aria-label="雪花特效" />
    </div>
  </>;
}
