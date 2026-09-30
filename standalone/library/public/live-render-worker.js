// client/live-composition.mjs
var layouts = Object.freeze({
  presenter: { name: "\u4EBA\u7269\u5168\u5C4F", width: 1920, height: 1080, camera: { x: 0, y: 0, width: 1920, height: 1080, fit: "cover" } },
  "screen-inset": { name: "\u5C4F\u5E55 + \u4EBA\u7269\u5C0F\u7A97", width: 1920, height: 1080, screen: { x: 0, y: 0, width: 1920, height: 1080, fit: "contain" }, camera: { x: 28, y: 772, width: 380, height: 280, fit: "contain" } },
  portrait: { name: "\u4E0A\u5C4F\u5E55 + \u4E0B\u4EBA\u7269", width: 1080, height: 1920, screen: { x: 0, y: 240, width: 1080, height: 608, fit: "contain" }, camera: { x: 0, y: 848, width: 1080, height: 1072, fit: "cover" } }
});
function defaultLayoutSettings(layoutId) {
  const layout = layouts[layoutId];
  if (!layout) throw Error("\u8BF7\u9009\u62E9\u4E00\u79CD\u5F55\u5236\u5E03\u5C40");
  return Object.fromEntries(["screen", "camera"].filter((source) => layout[source]).map((source) => {
    const box = layout[source];
    return [source, { x: box.x / layout.width * 100, y: box.y / layout.height * 100, width: box.width / layout.width * 100, height: box.height / layout.height * 100, fit: box.fit }];
  }));
}
function normalizeLayoutSettings(layoutId, settings2) {
  const defaults = defaultLayoutSettings(layoutId), result = {};
  const finite = (value, fallback) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  for (const [source, base] of Object.entries(defaults)) {
    const box = settings2?.[source] || {}, width = clamp(finite(box.width, base.width), 5, 100), height = clamp(finite(box.height, base.height), 5, 100);
    result[source] = { x: clamp(finite(box.x, base.x), 0, 100 - width), y: clamp(finite(box.y, base.y), 0, 100 - height), width, height, fit: ["contain", "cover"].includes(box.fit) ? box.fit : base.fit };
  }
  return result;
}
function resolveLayout(layoutId, settings2) {
  const layout = layouts[layoutId];
  if (!layout) throw Error("\u8BF7\u9009\u62E9\u4E00\u79CD\u5F55\u5236\u5E03\u5C40");
  if (!settings2) return layout;
  const result = { ...layout };
  for (const [source, box] of Object.entries(normalizeLayoutSettings(layoutId, settings2))) result[source] = { x: box.x * layout.width / 100, y: box.y * layout.height / 100, width: box.width * layout.width / 100, height: box.height * layout.height / 100, fit: box.fit };
  return result;
}
function placement(sourceWidth, sourceHeight, box) {
  if (!(sourceWidth > 0 && sourceHeight > 0)) throw Error("\u753B\u9762\u5C3A\u5BF8\u65E0\u6548");
  const ratio = box.fit === "cover" ? Math.max(box.width / sourceWidth, box.height / sourceHeight) : Math.min(box.width / sourceWidth, box.height / sourceHeight);
  const width = sourceWidth * ratio, height = sourceHeight * ratio;
  return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
}
function composeFrame(context, layoutId, camera, screen, settings2) {
  const layout = resolveLayout(layoutId, settings2);
  context.fillStyle = "#000";
  context.fillRect(0, 0, layout.width, layout.height);
  function draw(frame, box) {
    if (!frame || !box) return;
    const size = placement(frame.displayWidth || frame.videoWidth || frame.width, frame.displayHeight || frame.videoHeight || frame.height, box);
    context.save();
    context.beginPath();
    context.rect(box.x, box.y, box.width, box.height);
    context.clip();
    context.drawImage(frame, size.x, size.y, size.width, size.height);
    context.restore();
  }
  draw(screen, layout.screen);
  draw(camera, layout.camera);
}

// client/live-render-worker.mjs
var running = false;
var cameraReader;
var screenReader;
var writer;
var latestScreen;
var screenTask;
var activeLayoutId;
var settings;
async function stop() {
  running = false;
  await Promise.allSettled([cameraReader?.cancel(), screenReader?.cancel()]);
  latestScreen?.close();
  latestScreen = null;
  try {
    await writer?.close();
  } catch {
  }
}
self.onmessage = async (event) => {
  if (event.data.type === "stop") {
    await stop();
    self.postMessage({ type: "stopped" });
    return;
  }
  if (event.data.type === "layout") {
    if (running) settings = normalizeLayoutSettings(activeLayoutId, event.data.settings);
    return;
  }
  if (event.data.type !== "start" || running) return;
  const { layoutId, camera, screen, output } = event.data, layout = layouts[layoutId];
  try {
    if (!layout) throw Error("\u753B\u9762\u5E03\u5C40\u65E0\u6548");
    activeLayoutId = layoutId;
    settings = normalizeLayoutSettings(layoutId, event.data.settings);
    running = true;
    cameraReader = camera.getReader();
    writer = output.getWriter();
    const canvas = new OffscreenCanvas(layout.width, layout.height), context = canvas.getContext("2d", { alpha: false });
    if (screen) {
      screenReader = screen.getReader();
      const first = await screenReader.read();
      if (first.done) throw Error("\u5C4F\u5E55\u5171\u4EAB\u5DF2\u7ED3\u675F");
      latestScreen = first.value;
      screenTask = (async () => {
        while (running) {
          const next = await screenReader.read();
          if (next.done) break;
          const old = latestScreen;
          latestScreen = next.value;
          old?.close();
        }
      })();
      screenTask.catch((error) => {
        if (running) self.postMessage({ type: "error", message: "\u5171\u4EAB\u753B\u9762\u4E2D\u65AD\uFF0C\u8BF7\u505C\u6B62\u5E76\u91CD\u65B0\u5F55\u5236\u3002" });
      });
    }
    let ready = false, lastTime = -1, frames = 0;
    while (running) {
      const next = await cameraReader.read();
      if (next.done) break;
      const frame = next.value;
      let composed;
      try {
        composeFrame(context, layoutId, frame, latestScreen, settings);
        const timestamp = Math.max(lastTime + 1, frame.timestamp);
        lastTime = timestamp;
        composed = new VideoFrame(canvas, { timestamp });
        if (!ready) {
          ready = true;
          self.postMessage({ type: "ready", width: layout.width, height: layout.height });
        }
        await writer.write(composed);
        frames++;
        if (frames % 5 === 0) self.postMessage({ type: "frame", timestamp, frames });
      } finally {
        frame.close();
        composed?.close();
      }
    }
    if (running) self.postMessage({ type: "error", message: "\u6444\u50CF\u5934\u753B\u9762\u5DF2\u7ED3\u675F\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u8BBE\u5907\u3002" });
  } catch (error) {
    if (running) self.postMessage({ type: "error", message: "\u5F55\u5236\u753B\u9762\u65E0\u6CD5\u5408\u6210\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u8BBE\u5907\u3002" });
  } finally {
    await stop();
  }
};
