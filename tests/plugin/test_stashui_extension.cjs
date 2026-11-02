const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Import as an ES module, exactly as Stash UI does, without changing the
// repository's CommonJS test setup or requiring classic Stash's PluginApi.
const root = path.join(__dirname, "../..");
const source = fs.readFileSync(path.join(root, "plugin/assets/stashui.js"), "utf8");
function element(tag) {
  return {
    tag, children: [], attributes: {}, style: {}, listeners: new Map(),
    setAttribute(key, value) { this.attributes[key] = value; },
    hasAttribute(key) { return key in this.attributes; },
    addEventListener(event, callback) { this.listeners.set(event, callback); },
    removeEventListener(event, callback) {
      if (this.listeners.get(event) === callback) this.listeners.delete(event);
    },
    getBoundingClientRect() { return { top: 180 }; },
    appendChild(child) { this.children.push(child); child.parent = this; },
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    },
  };
}
global.document = { createElement: element };
global.window = Object.assign(element("window"), {
  innerHeight: 900, location: { origin: "https://example.test" },
  visualViewport: Object.assign(element("viewport"), { height: 900, offsetTop: 0 }),
});
function host(features) {
  return {
    nav: [], slots: [], routes: [],
    has: (feature) => features.includes(feature),
    t: (text) => text,
    addNavItem(entry) { this.nav.push(entry); },
    addSlot(name, entry) { this.slots.push({ name, ...entry }); },
    addRoute(entry) { this.routes.push(entry); },
  };
}
function destination(link) {
  const url = new URL(link.href.slice(1), "https://example.test");
  assert.equal(url.pathname, "/p/stash-curator");
  return url.searchParams;
}

(async () => {
  const { default: setup } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  setup(undefined);
  setup({});
  const unsupported = host([]);
  setup(unsupported);
  assert.equal(unsupported.nav.length, 0);
  assert.equal(unsupported.slots.length, 0);

  const api = host(["route", "navItem", "slot:scene.info", "slot:performer.header"]);
  setup(api);
  assert.equal(api.nav.length, 1);
  assert.equal(api.nav[0].group, "Extensions");
  assert.equal(destination(api.nav[0]).size, 0);
  assert.equal(api.routes.length, 1);
  assert.equal(api.routes[0].path, "");
  assert.deepEqual(api.slots.map((slot) => slot.name), ["scene.info", "performer.header"]);
  const scene = api.slots[0];
  const performer = api.slots[1];

  // Text and query encoding must round-trip punctuation without HTML injection
  // or letting a label become another Curator query parameter.
  const label = 'A & B <script> # + / ? " =';
  for (const [slot, kind] of [[scene, "scene"], [performer, "performer"]]) {
    const container = element("section");
    const native = element("div");
    container.appendChild(native);
    const controller = new AbortController();
    const cleanup = slot.mount(container, {
      id: "42", item: { title: label, name: label }, signal: controller.signal,
    });
    const group = container.children[1];
    assert.equal(group.attributes.role, "group");
    assert.equal(group.children.length, kind === "scene" ? 1 : 2);
    const similar = destination(group.children[0]);
    assert.equal(similar.get("view"), "similar");
    assert.equal(similar.get("type"), kind);
    assert.equal(similar.get("id"), "42");
    assert.equal(similar.get("label"), label);
    if (kind === "performer") {
      const hunt = destination(group.children[1]);
      assert.equal(hunt.get("view"), "hunt");
      assert.equal(hunt.get("performer"), "42");
      assert.equal(hunt.get("label"), label);
    }
    controller.abort();
    cleanup();
    assert.deepEqual(container.children, [native]);
  }
  const empty = element("section");
  assert.equal(scene.mount(empty, { item: {} }), undefined);
  assert.equal(empty.children.length, 0);
  const controller = new AbortController();
  controller.abort();
  assert.equal(scene.mount(empty, { id: "42", signal: controller.signal }), undefined);
  const cleanup = performer.mount(empty, { item: { id: "42", name: label } });
  assert.equal(destination(empty.children[0].children[1]).get("performer"), "42");
  cleanup();
  assert.equal(empty.children.length, 0);

  const partial = host(["route", "slot:scene.info"]);
  setup(partial);
  assert.equal(partial.nav.length, 0);
  assert.deepEqual(partial.slots.map((slot) => slot.name), ["scene.info"]);

  // The full app gets a dedicated frame, not a link to the Classic workshop.
  // Exercise loading, retry, responsive sizing, local navigation and disposal.
  const container = element("section");
  const controller2 = new AbortController();
  const dispose = api.routes[0].render(container, {
    query: { view: "similar", type: "scene", id: "42", label },
    signal: controller2.signal,
  });
  const shell = container.children[0];
  const [toolbar, frame] = shell.children;
  const [home, retry, status] = toolbar.children;
  assert.equal(frame.tag, "iframe");
  assert.equal(frame.allowFullscreen, true);
  assert.match(frame.allow, /picture-in-picture/);
  assert.equal(frame.style.height, "704px");
  const boot = new URL(frame.src, "https://example.test");
  assert.equal(boot.pathname, "/");
  const entry = new URL(boot.searchParams.get("kbroute"), boot.origin);
  assert.equal(entry.pathname, "/plugins/stash-curator");
  assert.equal(entry.searchParams.get("label"), label);
  const initialSrc = frame.src;
  const frameDoc = element("document");
  frame.contentDocument = frameDoc;
  frame.contentWindow = { location: { href: "https://example.test/plugins/stash-curator" } };
  frame.listeners.get("load")();
  assert.equal(status.textContent, "");
  const keepLocal = frameDoc.listeners.get("click");
  const anchor = Object.assign(element("a"), { href: "https://example.test/scenes/42" });
  anchor.setAttribute("target", "_blank");
  keepLocal({ button: 0, target: { closest: () => anchor } });
  assert.equal(anchor.attributes.target, "_self");
  // Settings, tags, performers and report links all stay in the frame.
  for (const path of ["/settings?tab=plugins", "/tags/42", "/performers/42", "/plugins/stash-curator?view=manage"]) {
    anchor.href = "https://example.test" + path;
    anchor.setAttribute("target", "_blank");
    keepLocal({ button: 0, target: { closest: () => anchor } });
    assert.equal(anchor.attributes.target, "_self");
  }
  anchor.href = "https://external.example/scenes/42";
  anchor.setAttribute("target", "_blank");
  keepLocal({ button: 0, target: { closest: () => anchor } });
  assert.equal(anchor.attributes.target, "_blank");
  anchor.href = "https://example.test/scenes/42";
  keepLocal({ button: 0, ctrlKey: true, target: { closest: () => anchor } });
  assert.equal(anchor.attributes.target, "_blank");
  anchor.setAttribute("download", "report.json");
  keepLocal({ button: 0, target: { closest: () => anchor } });
  assert.equal(anchor.attributes.target, "_blank");
  frame.listeners.get("error")();
  assert.match(status.textContent, /Reload Curator/);
  retry.listeners.get("click")();
  assert.equal(frame.src, initialSrc);
  frame.listeners.get("load")();
  assert.notEqual(frameDoc.listeners.get("click"), keepLocal);
  home.listeners.get("click")();
  assert.equal(new URL(frame.src, boot.origin).searchParams.get("kbroute"), "/plugins/stash-curator");
  window.visualViewport.height = 620;
  window.visualViewport.listeners.get("resize")();
  assert.equal(frame.style.height, "424px");
  controller2.abort();
  dispose();
  assert.equal(container.children.length, 0);
  assert.equal(frameDoc.listeners.size, 0);
  assert.equal(frame.listeners.size, 0);
  assert.equal(window.listeners.size, 0);
  assert.equal(window.visualViewport.listeners.size, 0);
  const aborted = new AbortController();
  aborted.abort();
  assert.equal(api.routes[0].render(container, { signal: aborted.signal }), undefined);
  assert.equal(container.children.length, 0);

  const yaml = fs.readFileSync(path.join(root, "plugin/stash-curator.yml"), "utf8");
  assert.match(yaml, /assets:\s+\/: assets/);
  assert.doesNotMatch(yaml, /javascript:\s+- assets\/stashui.js/);
  console.log("Stash UI adapter: routes, full-app frame, context links, local navigation, media permissions, resizing, retry, cleanup, and fallback passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
