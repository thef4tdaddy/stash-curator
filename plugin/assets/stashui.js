// Optional Stash UI API v2 adapter. Classic Stash still loads only the
// existing React frontend; do not list this ES module in ui.javascript.
const CURATOR_PATH = "/plugins/stash-curator";
const EXTENSION_PATH = "#/p/stash-curator";

function extensionHref(params = {}) {
  const query = new URLSearchParams(params).toString();
  return EXTENSION_PATH + (query ? `?${query}` : "");
}

function curatorPath(params = {}) {
  const query = new URLSearchParams(params).toString();
  return CURATOR_PATH + (query ? `?${query}` : "");
}

// Curator's entire React app runs in a same-origin frame, keeping its router,
// native cards, player and tracking together. The extension owns the window:
// no Classic Stash workshop header, separate tab, or second navigation shell.
function renderCurator(el, { query = {}, signal } = {}) {
  if (signal?.aborted) return;
  const shell = document.createElement("section");
  shell.style.cssText = "display:flex;flex-direction:column;gap:.5rem;min-width:0";
  const tools = document.createElement("div");
  tools.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:.5rem";
  const home = document.createElement("button");
  home.type = "button";
  home.className = "kb-btn";
  home.textContent = "Curator home";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "kb-btn";
  retry.textContent = "Reload Curator";
  const status = document.createElement("span");
  status.className = "kb-hint";
  status.setAttribute("role", "status");
  const frame = document.createElement("iframe");
  frame.title = "Stash Curator";
  frame.allow = "autoplay; fullscreen; picture-in-picture";
  frame.allowFullscreen = true;
  frame.style.cssText = "width:100%;min-width:0;min-height:300px;border:0;border-radius:.5rem;background:var(--bg);flex:1";
  tools.appendChild(home);
  tools.appendChild(retry);
  tools.appendChild(status);
  shell.appendChild(tools);
  shell.appendChild(frame);
  el.appendChild(shell);

  let disposed = false;
  let detachDocument = () => {};
  let currentPath = curatorPath(query);
  // Boot through Stash's index so plugin routes are registered before routing.
  // Stash UI's classic script recognises the embedded window, suppresses its
  // navbar and does not redirect the index back into Stash UI.
  const load = (path) => {
    if (disposed) return;
    currentPath = path;
    status.textContent = "Loading Curator…";
    frame.src = `/?kbroute=${encodeURIComponent(path)}`;
  };
  const resize = () => {
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight;
    const top = frame.getBoundingClientRect().top - (viewport?.offsetTop || 0);
    frame.style.height = `${Math.max(300, height - Math.max(0, top) - 16)}px`;
  };
  const onLoad = () => {
    if (disposed) return;
    detachDocument();
    detachDocument = () => {};
    try {
      const doc = frame.contentDocument;
      if (!doc) throw new Error("Frame unavailable");
      // A few Curator reports use target=_blank for local entities. Ordinary
      // clicks must keep these, local settings and playback in this window.
      // External Stash-box links and downloads keep their original behavior.
      const keepLocal = (event) => {
        if (event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const anchor = event.target.closest?.("a[href]");
        if (!anchor || anchor.hasAttribute("download")) return;
        const url = new URL(anchor.href, frame.contentWindow.location.href);
        if (url.origin === window.location.origin) anchor.setAttribute("target", "_self");
      };
      doc.addEventListener("click", keepLocal, true);
      detachDocument = () => doc.removeEventListener("click", keepLocal, true);
      status.textContent = "";
    } catch (_) {
      status.textContent = "Curator could not be loaded here. Try Reload Curator.";
    }
    resize();
  };
  const onError = () => { status.textContent = "Curator could not be loaded. Try Reload Curator."; };
  const onHome = () => load(CURATOR_PATH);
  const onRetry = () => load(currentPath);
  frame.addEventListener("load", onLoad);
  frame.addEventListener("error", onError);
  home.addEventListener("click", onHome);
  retry.addEventListener("click", onRetry);
  window.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("scroll", resize);
  load(currentPath);
  resize();
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener("abort", cleanup);
    detachDocument();
    frame.removeEventListener("load", onLoad);
    frame.removeEventListener("error", onError);
    home.removeEventListener("click", onHome);
    retry.removeEventListener("click", onRetry);
    window.removeEventListener("resize", resize);
    window.visualViewport?.removeEventListener("resize", resize);
    window.visualViewport?.removeEventListener("scroll", resize);
    // Removing the frame also stops playback, polling and trackers in its app.
    shell.remove();
  };
  signal?.addEventListener("abort", cleanup, { once: true });
  return cleanup;
}

function contextActions(stashui, type) {
  return (el, ctx) => {
    const id = ctx.id ?? ctx.item?.id;
    if (id == null || id === "" || ctx.signal?.aborted) return;
    const label = (type === "scene" ? ctx.item?.title : ctx.item?.name) || "";
    const group = document.createElement("div");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", stashui.t("Curator actions"));
    group.style.cssText = "display:flex;flex-wrap:wrap;gap:.5rem";

    const addLink = (text, params) => {
      const link = document.createElement("a");
      link.className = "kb-btn";
      link.textContent = stashui.t(text);
      link.href = extensionHref(params);
      group.appendChild(link);
    };
    addLink("Find similar with Curator", { view: "similar", type, id: String(id), label });
    if (type === "performer") {
      addLink("Performer Hunt", { view: "hunt", performer: String(id), label });
    }
    el.appendChild(group);
    const cleanup = () => group.remove();
    ctx.signal?.addEventListener("abort", cleanup, { once: true });
    return () => {
      ctx.signal?.removeEventListener("abort", cleanup);
      cleanup();
    };
  };
}

export default function setup(stashui) {
  if (!stashui || typeof stashui.has !== "function" || !stashui.has("route")) return;
  stashui.addRoute({ path: "", title: "Stash Curator", render: renderCurator });
  // Registering our own navigation suppresses Stash UI's automatic Curator
  // entry. All entry points use our extension page, never the classic workshop.
  if (stashui.has("navItem")) {
    stashui.addNavItem({
      id: "curator",
      label: "Stash Curator",
      icon: "plug",
      group: "Extensions",
      href: extensionHref(),
    });
  }
  if (stashui.has("slot:scene.info")) {
    stashui.addSlot("scene.info", {
      id: "curator-scene",
      title: "Stash Curator",
      mount: contextActions(stashui, "scene"),
    });
  }
  if (stashui.has("slot:performer.header")) {
    stashui.addSlot("performer.header", {
      id: "curator-performer",
      title: "Stash Curator",
      mount: contextActions(stashui, "performer"),
    });
  }
}
