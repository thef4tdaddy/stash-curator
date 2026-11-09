<p align="center">
  <img src="docs/assets/stash-curator.svg" alt="Stash Curator compass" width="112">
</p>
<h1 align="center">Stash Curator</h1>
<p align="center"><strong>Rediscover scenes in your Stash library with recommendations that learn from feedback.</strong></p>

Stash Curator uses library metadata, viewing history, and feedback to recommend
scenes you already have. Open **Why this?** to see why a scene appeared and correct
the model when it gets something wrong. Connect [StashDB](https://stashdb.org)
for optional external metadata leads scored against your local taste model.

[Install](#install) · [Watch the video tour](https://mrx-31415.github.io/stash-curator/#tour)

<details open>
  <summary>Animated tour (show or hide)</summary>
  <p align="center">
    <img src="docs/assets/showcase-tour.gif" alt="Stash Curator tour: the For You row on Stash's home page, For You recommendations with Why this? and moving previews, a Roulette spin landing in Stash's player, Similar scenes in Find, and a Tag question in Curate" width="760">
  </p>
</details>

<p align="center">The animated tour uses fictional metadata and <a href="https://mrx-31415.github.io/stash-curator/#tour">credited Blender film clips</a>; no personal library appears. <a href="https://mrx-31415.github.io/stash-curator/#tour">Watch with playback controls</a>.</p>

## Install

Requires **Stash v0.31** and a `python` executable for the plugin launcher.
Curator ships compiled core binaries for supported platforms. StashDB is optional.

1. In Stash, open **Settings → Plugins → Available Plugins** and add
   `https://mrx-31415.github.io/stash-curator/index.yml` as a plugin source.
2. Install **Stash Curator** and reload plugins.
3. Open the compass in Stash's navigation and select **Sync and build recommendations**
   in the setup checklist to build your first model. You can also start it from
   **Manage → Tasks**.

The first build can take several minutes on a large library. If you use Docker,
Python and Curator's data paths must be available inside the Stash container. See
[Getting started](docs/getting-started.md) for supported platforms, storage setup,
and troubleshooting.

Once the model is ready, start with **Recommendations → For You**. Open **Why this?**
to inspect a suggestion, and use thumbs up/down or **Curate → Tag questions** to teach
Curator your preferences. Feedback affects rankings after a model update.

## Explore Curator

### Stash UI integration

To install the fork through Stash, use the [Stash UI preview plugin source](https://github.com/thef4tdaddy/stash-curator/releases/download/stashui-preview/index.yml)
under **Settings → Plugins → Available Plugins**. When switching an existing
installation, keep its **Local Path** so it uses the same data directory.
To publish a new preview, run **StashUI preview package** from `main` in the
fork's GitHub Actions. Stash can refresh the same source after the run succeeds.

**Install this adapter into an existing Curator installation:** download
[`scripts/install_stashui.py`](https://raw.githubusercontent.com/thef4tdaddy/stash-curator/main/scripts/install_stashui.py)
and run it with Python, passing the installed Curator folder:

```bash
python3 install_stashui.py "/path/to/stash/plugins/stash-curator"
```

The folder must contain `stash-curator.yml`. For Docker, run inside the container
or pass the host path to the mounted plugin folder. With no path argument the
installer looks under the usual `/root/.stash/plugins`, `/config/plugins`, and
your home directory's `.stash/plugins` folders, and proceeds only for one match.
It verifies the adapter's checksum, backs up affected files, and preserves the
installed Curator version, backend, database and settings. Reload plugins, refresh
Stash UI, and open **Extensions → Stash Curator**. This is an adapter installer,
not a Stash plugin-manager source; upstream plugin updates may overwrite it, so
rerun it after those updates. No Go compiler is needed.

To try the adapter from this checkout with an existing Curator installation, run
`python3 scripts/install_stashui.py --adapter-file plugin/assets/stashui.js "/path/to/stash/plugins/stash-curator"`.

This fork includes an optional [Stash UI API v2](https://github.com/anonym88312/stash-pmv-plugins/tree/main/plugins/stashui#for-plugin-authors-extension-modules-api-v2)
adapter. With Stash UI enabled, **Extensions → Stash Curator** opens a dedicated
extension page containing Curator's complete interface. The scene player's info panel gets
**Find similar with Curator**; performer pages get that button and **Performer Hunt**.
The selected scene or performer is passed to the existing Curator view.

Recommendations, Find, Curate, Insights, Manage, settings, feedback, Whisparr
actions and playback all use the existing Curator app inside the extension window.
Local scene, performer, tag and settings links stay in that window, including links
that normally open a new tab. **Curator home** returns from a local detail page;
**Reload Curator** retries the initial view. External Stash-box links and downloads
keep their normal behavior. The player supports fullscreen and picture-in-picture.

The extension hosts the existing React app in a same-origin iframe, with classic
Stash's navbar hidden by Stash UI. Users do not need to open or switch to classic
Stash. This is an embedded integration, not a rewrite of Curator's React interface.
Stash UI Home loads **Curator For You** as you scroll to the extension section.
Once it has picks, it hides the built-in **For you** and **Long time no see** rows.
Those rows remain available if Curator has no picks or the request fails. Continue
watching, Favorites, Recently added and Shuffle stay available. The extension
does not add Curator's playback tracking to the standalone Stash UI player.

After updating the plugin, reload plugins and refresh Stash UI. Its Plugins page
should show a **Stash UI extension** block for Curator with one route, one menu entry and three
slots. Stash UI caches module discovery per plugin version; if testing an adapter
added to an already-installed version, clear only its module-discovery cache in
the browser console (`localStorage.removeItem("stashui.extMods1")`), then reload.

### Recommendations

Browse seven lanes of scenes from your library: For You, Best Bets, New Arrivals,
Revisit, Stretch, Blind Spots, and Dormant. Each offers a different way to find something
to watch.
[Learn how to choose a lane](docs/using-curator.md#choose-a-lane).

Lanes also appear as rows on Stash's home page and as a **Curator Lane** filter on
Stash's scene list. **Play lane** turns a lane into a continuous playlist, and
**Roulette** spins a wheel of the lane's picks and plays the winner.
[Play a lane](docs/using-curator.md#play-a-lane) ·
[Roulette](docs/using-curator.md#roulette).

### Find

Find opens on Expand. After you connect StashDB and refresh its candidate cache,
Expand ranks recent external leads against your taste. Similar finds related scenes
or performers in your library or on StashDB; Performer Hunt follows one performer's
catalog. An external result does not mean you have the scene.

<p align="center">
  <img src="docs/assets/showcase-find-poster.jpg" alt="Find's Similar view comparing a library scene with related scene cards" width="760">
</p>

[Learn how to use Find](docs/using-curator.md#find).

### Curate

Answer a few Tag questions, tell Curator what makes your hits work in Why these?,
rate tags in Tag sentiment, or give direct feedback on a scene to help Curator learn.
Open **Why this?** on a result to inspect its reasons. After a model build, Impact
shows what your feedback changed.

[Learn how to use Curate](docs/using-curator.md#curate).

Each recommendation distinguishes **Appeal** (your longer-term interest) from
**Current Fit** (whether it suits you now). Read [how recommendations work](docs/recommendations.md)
for the scoring details.

## Safety and privacy

- Your history, feedback, and model stay in a local SQLite database you control.
- StashDB discovery is optional and read-only. StashDB never receives your model.
- Curator never deletes media. An explicit Prune action only adds or removes a tag.
- Whisparr receives an item only when you choose **Send to Whisparr**.

See [Privacy](docs/privacy.md) for details.

## Status

Stash Curator is **preview software (pre-1.0)**. Automatic background updates and
scheduled tasks are optional; see [Using Curator](docs/using-curator.md).
Developers can start with [Contributing](docs/contributing.md).

## Project provenance

The idea was inspired by [Restash by Espionage9248](https://github.com/Espionage9248/Restash/tree/main/restash).

Stash Curator is primarily generated with AI coding agents under human direction,
review, and testing.

Licensed under [AGPL-3.0](LICENSE).
