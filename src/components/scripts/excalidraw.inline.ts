// @ts-nocheck
import { exportScene } from "@excalidraw/utils";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.15;

async function initExcalidraw() {
  const framePage = document.querySelector(".page[data-frame='excalidraw']");
  if (framePage) {
    initSidebar(framePage);
    await renderExcalidrawPage(framePage);
    return;
  }

  const embeddedPages = document.querySelectorAll(".excalidraw-page");
  for (const page of embeddedPages) {
    await renderExcalidrawPage(page);
  }
}

async function toDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image fetch failed: ${url}`);
  const blob = await response.blob();
  const dataURL = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { dataURL, mimeType: blob.type || "application/octet-stream" };
}

async function renderExcalidrawPage(page) {
  const container = page.querySelector(".excalidraw-container");
  const dataNode = page.querySelector(".excalidraw-data");
  if (!container || !dataNode || page.dataset.excalidrawRendering === "true") return;
  page.dataset.excalidrawRendering = "true";

  try {
    const scene = JSON.parse(dataNode.textContent || "{}");
    const files = { ...(scene.files || {}) };
    await Promise.all(Object.entries(scene.imagePaths || {}).map(async ([id, path]) => {
      if (files[id]?.dataURL) return;
      try {
        const image = await toDataUrl(path);
        files[id] = {
          id,
          mimeType: image.mimeType,
          dataURL: image.dataURL,
          created: Date.now(),
        };
      } catch (error) {
        console.warn(`[Excalidraw] Could not load linked image ${path}`, error);
      }
    }));

    const preferredTheme = scene.darkMode === "auto"
      ? (document.documentElement.getAttribute("saved-theme") === "dark" ? "dark" : "light")
      : scene.darkMode;
    const appState = scene.appState || {};
    const svg = await exportScene({
      type: "svg",
      data: {
        elements: (scene.elements || []).filter((element) => !element.isDeleted),
        appState,
        files,
      },
      config: {
        theme: preferredTheme,
        canvasBackgroundColor: appState.exportBackground === false
          ? false
          : appState.viewBackgroundColor || "#ffffff",
        padding: scene.exportPadding ?? 20,
        embedScene: false,
      },
    });
    if (!page.isConnected) return;
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    container.replaceChildren(svg);
    if (scene.enableInteraction !== false) initPanZoom(page);
  } catch (error) {
    console.error("[Excalidraw] Could not render drawing with Excalidraw exporter", error);
    page.dataset.excalidrawRendering = "error";
  }
}

function initSidebar(page) {
  const toggle = page.querySelector(".excalidraw-sidebar-toggle");
  if (!toggle) return;

  toggle.addEventListener("click", () => {
    page.classList.toggle("excalidraw-sidebar-open");
  });

  window.addCleanup(() => {
    page.classList.remove("excalidraw-sidebar-open");
  });
}

function initPanZoom(page) {
  const container = page.querySelector(".excalidraw-container");
  if (!container) return;

  const svg = container.querySelector("svg");
  if (!svg) return;

  container.style.backgroundColor = "var(--excalidraw-bg, var(--light))";

  var overlaysContainer = page.querySelector(".excalidraw-overlays");

  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let startX = 0;
  let startY = 0;

  function positionOverlays() {
    if (!overlaysContainer) return;
    var overlays = overlaysContainer.querySelectorAll(".excalidraw-overlay");
    if (overlays.length === 0) return;

    var offX = parseFloat(overlaysContainer.getAttribute("data-offset-x")) || 0;
    var offY = parseFloat(overlaysContainer.getAttribute("data-offset-y")) || 0;

    var ctm = svg.getScreenCTM();
    var containerRect = container.getBoundingClientRect();
    if (!ctm) return;

    for (var i = 0; i < overlays.length; i++) {
      var el = overlays[i];
      var ex = parseFloat(el.getAttribute("data-x")) || 0;
      var ey = parseFloat(el.getAttribute("data-y")) || 0;
      var ew = parseFloat(el.getAttribute("data-w")) || 0;
      var eh = parseFloat(el.getAttribute("data-h")) || 0;

      var svgX = ex + offX;
      var svgY = ey + offY;

      var screenLeft = svgX * ctm.a + ctm.e - containerRect.left;
      var screenTop = svgY * ctm.d + ctm.f - containerRect.top;
      var screenWidth = ew * ctm.a;
      var screenHeight = eh * ctm.d;

      el.style.left = screenLeft + "px";
      el.style.top = screenTop + "px";
      el.style.width = screenWidth + "px";
      el.style.height = screenHeight + "px";
      el.style.display = "flex";
    }
  }

  positionOverlays();

  function applyTransform() {
    svg.style.transform = "translate(" + panX + "px, " + panY + "px) scale(" + zoom + ")";
    positionOverlays();
  }

  function zoomAt(nextZoom, x, y) {
    var boundedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    if (boundedZoom === zoom) return;
    var ratio = boundedZoom / zoom;
    panX = x - (x - panX) * ratio;
    panY = y - (y - panY) * ratio;
    zoom = boundedZoom;
    applyTransform();
  }

  function handleWheel(e) {
    e.preventDefault();
    var delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    var rect = container.getBoundingClientRect();
    zoomAt(zoom + delta, rect.width / 2, rect.height / 2);
  }

  function handleMouseDown(e) {
    if (e.button !== 0) return;
    isDragging = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
    container.style.cursor = "grabbing";
  }

  function handleMouseMove(e) {
    if (!isDragging) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    applyTransform();
  }

  function handleMouseUp() {
    isDragging = false;
    container.style.cursor = "grab";
  }

  var zoomInBtn = page.querySelector(".excalidraw-zoom-in");
  var zoomOutBtn = page.querySelector(".excalidraw-zoom-out");
  var resetBtn = page.querySelector(".excalidraw-reset");

  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", function () {
      zoomAt(zoom + ZOOM_STEP, container.clientWidth / 2, container.clientHeight / 2);
    });
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", function () {
      zoomAt(zoom - ZOOM_STEP, container.clientWidth / 2, container.clientHeight / 2);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      zoom = 1;
      panX = 0;
      panY = 0;
      applyTransform();
    });
  }

  var lastTouchDist = 0;

  function handleTouchStart(e) {
    if (e.touches.length === 1) {
      isDragging = true;
      startX = e.touches[0].clientX - panX;
      startY = e.touches[0].clientY - panY;
    } else if (e.touches.length === 2) {
      isDragging = false;
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist = Math.sqrt(dx * dx + dy * dy);
    }
  }

  function handleTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1 && isDragging) {
      panX = e.touches[0].clientX - startX;
      panY = e.touches[0].clientY - startY;
      applyTransform();
    } else if (e.touches.length === 2 && lastTouchDist > 0) {
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var scale = dist / lastTouchDist;
      lastTouchDist = dist;
      var rect = container.getBoundingClientRect();
      var centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      var centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      zoomAt(zoom * scale, centerX, centerY);
    }
  }

  function handleTouchEnd() {
    isDragging = false;
    lastTouchDist = 0;
  }

  container.addEventListener("wheel", handleWheel, { passive: false });
  container.addEventListener("mousedown", handleMouseDown);
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
  container.addEventListener("touchstart", handleTouchStart, { passive: true });
  container.addEventListener("touchmove", handleTouchMove, { passive: false });
  container.addEventListener("touchend", handleTouchEnd);

  window.addCleanup(function () {
    container.removeEventListener("wheel", handleWheel);
    container.removeEventListener("mousedown", handleMouseDown);
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    container.removeEventListener("touchstart", handleTouchStart);
    container.removeEventListener("touchmove", handleTouchMove);
    container.removeEventListener("touchend", handleTouchEnd);
  });
}

document.addEventListener("nav", initExcalidraw);
