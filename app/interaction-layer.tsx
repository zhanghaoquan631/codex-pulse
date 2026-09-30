"use client";

import { useEffect } from "react";
import { playClickSound, playHoverSound } from "@/lib/theme-sound";

// Adapted from isablyns' current cursortip.js: a centred stamp, direct
// pointer tracking, and per-target cursor hiding. No input is intercepted.
const entrySelector = ".console-nav button,.token-section-tabs button,.website-title,.box-toggle,.box-open,.box-link-copy a,.box-timeline a,.pro-shortcut,.pro-primary-link,.knowledge-primary,.knowledge-secondary,.knowledge-entry,.shop-open,.atlas-open,.music-button,.rooster-actions a,.betteropc-actions a,.activity-module-group button,.shop-sections button,.library-filters button,.ranking-row";
const cardSelector = ".summary-card,.quota-card,.panel,.website-card,.website-box,.knowledge-hero,.knowledge-feature,.knowledge-phone,.pro-login-card,.pro-shortcut,.pro-info-card,.ledger-summary>div,.ledger-explanation,.activity-connection,.activity-gate,.betteropc-frame-wrap,.shop-frame-wrap,.atlas-frame-wrap,.rooster-stage,.local-app-frame-wrap,.music-player,.music-service";
const frameCardSelector = ".panel,.surface,.card,.receipt-grid-card,.merchant-rank-card,.counts>div,[class*=repo-card],[class*=task-card],[class*=snippet-card]";
const controlSelector = "button,a[href],[role=button],[role=tab],[role=switch],summary";

function attach(doc: Document, embedded: boolean): () => void {
  const view = doc.defaultView;
  if (!view || !doc.body) return () => {};
  const win = view;
  const fine = win.matchMedia("(hover: hover) and (pointer: fine)");
  const cursor = doc.createElement("span");
  cursor.className = "pulse-cursor-tip";
  cursor.setAttribute("aria-hidden", "true");
  doc.body.appendChild(cursor);
  let active: Element | null = null;
  let hoveredControl: Element | null = null;
  let lastTick = 0;
  let scanFrame = 0;
  const cards = new Set<Element>();
  const controls = new Set<Element>();
  const inScope = (node: Element) => embedded || !!node.closest(".console-shell,[role=dialog]");
  const enabled = (node: Element) => !node.matches(":disabled,[aria-disabled=true]") && !node.closest("[inert]");

  function scan() {
    scanFrame = 0;
    doc.querySelectorAll(embedded ? frameCardSelector : cardSelector).forEach(node => {
      if (!inScope(node)) return;
      node.classList.add("pulse-hover-card");
      cards.add(node);
    });
    doc.querySelectorAll(controlSelector).forEach(node => {
      if (!inScope(node)) return;
      node.classList.add("pulse-control");
      controls.add(node);
    });
    // Removed React pages and modal bodies must not accumulate in the registry.
    for (const node of cards) if (!node.isConnected) cards.delete(node);
    for (const node of controls) if (!node.isConnected) controls.delete(node);
    if (active && !active.isConnected) hide();
  }
  function hide() {
    active?.removeAttribute("data-pulse-cursor-on");
    active = null;
    cursor.classList.remove("is-on");
  }
  function label(node: Element): string {
    if (node.closest(".console-nav")) return "去" + (node.getAttribute("aria-label") || "看看");
    if (node.matches(".library-filters button,.ranking-row")) return "筛选";
    if (node.matches(".box-toggle")) return node.getAttribute("aria-expanded")==="true"?"收起":"展开";
    if (node.matches(".token-section-tabs button")) return "查看";
    if (node.matches(".activity-module-group button,.shop-sections button")) return "切换";
    if (node.matches("a")) return node.getAttribute("target") === "_blank" ? "打开 ↗" : "进入 →";
    return "查看";
  }
  function place(event: PointerEvent) {
    cursor.style.translate = `calc(${event.clientX}px - 50%) calc(${event.clientY}px - 50%)`;
  }
  function over(event: PointerEvent) {
    if (!fine.matches || (event.pointerType && event.pointerType !== "mouse")) return;
    const target = event.target instanceof win.Element ? event.target : null;
    if (!target || !inScope(target) || target.closest("input,textarea,select,[contenteditable=true],iframe")) { hide(); return; }
    const control = target.closest(controlSelector);
    if (control !== hoveredControl) {
      hoveredControl = control;
      if (control && enabled(control) && performance.now() - lastTick > 70) {
        playHoverSound();
        lastTick = performance.now();
      }
    }
    const hit = target.closest(embedded ? "a.card,a.surface,[data-pulse-cursor-tip]" : entrySelector);
    if (!hit || !enabled(hit)) { hide(); return; }
    if (active !== hit) {
      hide();
      active = hit;
      active.setAttribute("data-pulse-cursor-on", "");
      cursor.textContent = hit.getAttribute("data-pulse-cursor-tip") || label(hit);
    }
    place(event);
    cursor.classList.add("is-on");
  }
  function move(event: PointerEvent) { if (active) place(event); }
  function press() { hide(); }
  function click(event: MouseEvent) {
    if (!event.isTrusted) return;
    const target = event.target instanceof win.Element ? event.target : null;
    const control = target?.closest(controlSelector);
    if (!control || !inScope(control) || !enabled(control)) return;
    if (!embedded && control.closest(".console-nav,.token-section-tabs,.theme-toggle,.pulse-sound-toggle")) return;
    playClickSound();
  }
  function visibility() { if (doc.hidden) hide(); }
  scan();
  const observer = new win.MutationObserver(records => {
    if (!records.some(record => [...record.addedNodes].some(node => node.nodeType === 1) || record.removedNodes.length)) return;
    if (!scanFrame) scanFrame = win.requestAnimationFrame(scan);
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  doc.addEventListener("pointerover", over);
  doc.addEventListener("pointermove", move, { passive: true });
  doc.addEventListener("pointerdown", press);
  doc.addEventListener("click", click);
  doc.addEventListener("scroll", hide, true);
  doc.addEventListener("visibilitychange", visibility);
  doc.documentElement.addEventListener("mouseleave", hide);
  win.addEventListener("blur", hide);
  fine.addEventListener("change", hide);
  return () => {
    hide(); observer.disconnect(); win.cancelAnimationFrame(scanFrame);
    doc.removeEventListener("pointerover", over);
    doc.removeEventListener("pointermove", move);
    doc.removeEventListener("pointerdown", press);
    doc.removeEventListener("click", click);
    doc.removeEventListener("scroll", hide, true);
    doc.removeEventListener("visibilitychange", visibility);
    doc.documentElement.removeEventListener("mouseleave", hide);
    win.removeEventListener("blur", hide); fine.removeEventListener("change", hide);
    cards.forEach(node => node.classList.remove("pulse-hover-card"));
    controls.forEach(node => node.classList.remove("pulse-control"));
    cursor.remove();
  };
}

function attachFrames(host: Document, depth = 0): () => void {
    if (depth >= 4 || !host.body) return () => {};
    const frames = new Map<HTMLIFrameElement, { load: () => void; stop?: () => void; style?: HTMLLinkElement }>();
    function scanFrames() {
      for (const [frame, entry] of frames) if (!frame.isConnected) { entry.stop?.(); frame.removeEventListener("load", entry.load); frames.delete(frame); }
      host.querySelectorAll<HTMLIFrameElement>(depth ? "iframe" : ".console-shell iframe").forEach(frame => {
        if (frames.has(frame)) return;
        const url = new URL(frame.src, location.href);
        // Scene replicas own their effects. External pages retain their own UI.
        if (url.origin !== location.origin || !/^\/(local-apps|mezip|games)\//.test(url.pathname)) return;
        const entry: { load: () => void; stop?: () => void; style?: HTMLLinkElement } = { load: () => {} };
        entry.load = () => {
          entry.stop?.(); entry.style?.remove();
          try {
            const doc = frame.contentDocument;
            if (!doc?.body || !doc.head) return;
            const style = doc.createElement("link");
            style.rel = "stylesheet"; style.href = "/interactions-frame.css";
            doc.head.appendChild(style); entry.style = style;
            const stop = attach(doc, true);
            const stopNested = attachFrames(doc, depth + 1);
            entry.stop = () => { stop(); stopNested(); };
          } catch { /* A redirected or unavailable frame can remain independent. */ }
        };
        frames.set(frame, entry); frame.addEventListener("load", entry.load); entry.load();
      });
    }
    scanFrames();
    const observer = new MutationObserver(scanFrames);
    observer.observe(host.querySelector(".console-content") || host.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      for (const [frame, entry] of frames) { entry.stop?.(); entry.style?.remove(); frame.removeEventListener("load", entry.load); }
    };
}

export default function InteractionLayer() {
  useEffect(() => {
    const stopMain=attach(document,false);
    const stopFrames=attachFrames(document);
    return () => { stopMain(); stopFrames(); };
  }, []);
  return null;
}
