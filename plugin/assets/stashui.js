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

function homeRecommendations(stashui) {
  return async (el, { signal }) => {
    const section = el.closest('section[data-xslot="home.section"]');
    if (signal?.aborted) return;
    try {
      const { runPluginOperation: slate } = await stashui.gql(
        'mutation CuratorHome($args: Map!) { runPluginOperation(plugin_id: "stash-curator", args: $args) }',
        { args: { operation: "get_slate", lane: "for_you", count: 12, context: { route: "stashui-home" } } },
        { signal },
      );
      if (signal?.aborted) return;
      const ids = [...new Set((slate?.items || []).map((item) => Number(item.scene_id)))].filter(
        (id) => Number.isSafeInteger(id) && id > 0 && id <= 2147483647,
      );
      if (!ids.length) {
        if (section) section.hidden = true;
        return;
      }
      // Query by filter so Stash UI can apply its hidden-folder rules. Stash's
      // direct scene_ids lookup bypasses scene_filter entirely.
      const filter = ids.reduceRight((rest, id) => ({
        id: { value: id, modifier: "EQUALS" }, ...(rest && { OR: rest }),
      }), null);
      const { findScenes } = await stashui.gql(
        `query CuratorHomeScenes($filter: SceneFilterType!) {
          findScenes(scene_filter: $filter, filter: { per_page: 12 }) {
            scenes { id title paths { screenshot } }
          }
        }`, { filter }, { signal },
      );
      if (signal?.aborted) return;
      const scenes = new Map(findScenes.scenes.map((scene) => [Number(scene.id), scene]));
      const picks = ids.flatMap((id) => {
        const scene = scenes.get(id);
        return scene ? [{ id: String(id), title: scene.title || `Scene ${id}`, thumb: scene.paths?.screenshot }] : [];
      });
      if (!picks.length) {
        if (section) section.hidden = true;
        return;
      }

      const grid = document.createElement("div");
      grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,160px),1fr));gap:.5rem;margin-bottom:.5rem";
      picks.forEach((pick, index) => {
        const card = document.createElement("a");
        card.href = `#/scene/${pick.id}`;
        card.className = "kb-piece";
        card.style.aspectRatio = "16 / 9";
        if (pick.thumb) {
          const image = document.createElement("img");
          image.alt = "";
          image.loading = "lazy";
          image.addEventListener("load", () => image.classList.add("is-loaded"), { once: true });
          image.src = pick.thumb;
          card.appendChild(image);
        }
        const caption = document.createElement("span");
        caption.className = "kb-placard";
        const title = document.createElement("b");
        title.textContent = pick.title;
        caption.appendChild(title);
        card.appendChild(caption);
        if (stashui.has("play")) {
          card.addEventListener("click", (event) => {
            if (event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            if (stashui.play(picks, index)) event.preventDefault();
          });
        }
        grid.appendChild(card);
      });
      const more = document.createElement("a");
      more.className = "kb-btn";
      more.href = extensionHref({ view: "for_you" });
      more.textContent = stashui.t("View all in Curator");
      const hide = document.createElement("style");
      // Keep the stock sections intact so the slot's removal restores them.
      hide.textContent = '[data-sections] > section:is([data-home="foryou"], [data-home="rewatch"]) { display: none; }';
      el.append(grid, more, hide);
    } catch (_) {
      if (!signal?.aborted && section) section.hidden = true;
    }
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
  if (stashui.has("slot:home.section") && stashui.has("gql")) {
    stashui.addSlot("home.section", {
      id: "curator-for-you",
      title: stashui.t("Curator For You"),
      mount: homeRecommendations(stashui),
    });
  }
}
