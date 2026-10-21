import { expect, test } from "@playwright/test";

import {
  dockPanel,
  dockTab,
  dragDockTab,
  invokeCmd,
  launchApp,
  newProject,
  summary,
  tmpDir,
} from "./helpers/driver";

const CANVAS = { width: 640, height: 360, fpsNum: 30, fpsDen: 1 };

const EDITING_WORKSPACE_ID = "editing";

interface WorkspaceProfile {
  id: string;
  name: string;
  current: unknown | null;
  saved: unknown | null;
}
interface WorkspaceDocument {
  version: number;
  activeId: string;
  profiles: WorkspaceProfile[];
}

test("built-in Editing workspace matches the Agent reference on creation and reset", async ({}, testInfo) => {
  const { app, page } = await launchApp({env:{SCLIP_JEV_ENABLED:'0',SCLIP_BACKGROUND_JEV_AUTHORIZED:'0'}});
  try {
    await app.evaluate(({BrowserWindow})=>{
      const win=BrowserWindow.getAllWindows()[0]!;
      if(win.isMaximized())win.unmaximize();
      win.setBounds({x:0,y:0,width:1280,height:800});
    });
    const parent=tmpDir("sclip-agent-layout-");
    const checkLayout=async()=>{
      await expect(dockPanel(page)).toHaveCount(10);
      await expect(dockPanel(page,"agent")).toBeVisible();
      const geometry=()=>page.evaluate(()=>{
        const rect=(selector:string)=>{
          const r=document.querySelector(selector)!.getBoundingClientRect();
          return {x:r.x,y:r.y,width:r.width,height:r.height};
        };
        const panel=(kind:string)=>rect(`.weft-dock-panel[data-panel-kind="${kind}"]`);
        return {workspace:rect('.dock-workspace'),preview:panel('preview'),timeline:panel('timeline'),agent:panel('agent'),strip:panel('quick-actions')};
      });
      await expect.poll(async()=>{const g=await geometry();return g.timeline.height/g.workspace.height}).toBeCloseTo(.28,1);
      const g=await geometry();
      // Panel body excludes Dockview borders from the fixed 44px group.
      expect(g.strip.width).toBeGreaterThanOrEqual(40);
      expect(g.strip.width).toBeLessThanOrEqual(44);
      expect(g.agent.height/g.workspace.height).toBeGreaterThan(.9);
      expect(g.agent.width/(g.workspace.width-44)).toBeCloseTo(.30,1);
      expect(g.preview.x).toBeCloseTo(g.timeline.x,0);
      expect(g.preview.width).toBeCloseTo(g.timeline.width,0);
      expect(g.timeline.x+g.timeline.width).toBeLessThanOrEqual(g.agent.x+2);
      expect(g.preview.y+g.preview.height).toBeLessThan(g.timeline.y);
      for(const kind of ['agent','attribute','effect','playhead','media','transitions','caption'])await expect(dockTab(page,kind)).toHaveCount(1);
    };
    await newProject(page,{parentFolder:parent,name:'first',canvas:CANVAS});
    await expect(page.locator('.splash-screen')).toHaveCount(0,{timeout:15000});
    await checkLayout();
    await page.screenshot({path:testInfo.outputPath('default-agent-layout.png')});
    await dockTab(page,'media').click();
    await page.locator('.menu-trigger').nth(2).click();
    await page.locator('.app-submenu-trigger').filter({hasText:/Workspaces|工作区/}).click();
    await page.locator('.app-menu-item').filter({hasText:/Reset Workspace|重置工作区/}).click();
    await checkLayout();
    await newProject(page,{parentFolder:parent,name:'second',canvas:CANVAS});
    await checkLayout();
    await page.screenshot({path:testInfo.outputPath('reset-and-project-switch.png')});
    expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.getMinimumSize())).toEqual([960,640]);
  } finally {await app.close();}
});

/**
 * The Quick Actions strip has no tab: its single tab renders as the six-dot
 * grip, shrunk to grip size and left in normal flow, with the whole group header
 * moved to the strip's leading edge (`headerPosition`) so the grip sits inline
 * with the buttons. The grip the user sees therefore IS Dockview's own drag
 * source.
 *
 * This is the ONE part of the strip that unit tests cannot reach — jsdom has no
 * layout and no real drag — and it is also the part that fails SILENTLY when the
 * arrangement drifts: the grip still paints, it just stops being draggable
 * (exactly what happened when the header was overlaid on the Panel content,
 * which `renderer: "always"` paints in a layer above the entire grid). Hence a
 * real pointer gesture here.
 */
test("the Quick Actions grip drags the strip, which takes its axis from where it lands", async () => {
  const { app, page } = await launchApp();
  try {
    const parent = tmpDir("weftcut-quick-actions-");
    await newProject(page, {
      parentFolder: parent,
      name: "quick-actions-drag",
      canvas: CANVAS,
    });
    // REQUIRED before any pointer gesture: the splash overlay outlives the
    // first dock render, so the grip is already visible while the splash is
    // still swallowing mousedown — the drag would simply never start.
    await expect(page.locator(".splash-screen")).toHaveCount(0, { timeout: 15_000 });

    const grip = page.locator(".weft-dock-tab--grip");
    // The drag must be started from the grip's `.dv-tab` box (what `dockTab`
    // returns) — that is the element Dockview marks `draggable`, and
    // Playwright's synthetic pointer sequence does not reliably promote a
    // mousedown on a descendant into a native HTML5 drag. The two boxes are
    // identical on screen: the tab IS the grip slot.
    const gripTab = dockTab(page, "quick-actions");
    const strip = dockPanel(page, "quick-actions");
    // Scoped by class, not by role: the preview transport is a toolbar too.
    const toolbar = page.locator(".weft-quick-actions");

    // Baseline: a full-height left edge bar, so the strip runs as a column.
    await expect(grip).toBeVisible();
    await expect(toolbar).toHaveAttribute("aria-orientation", "vertical");
    const before = await strip.boundingBox();
    if (!before) throw new Error("strip has no layout box");
    expect(before.height).toBeGreaterThan(before.width);

    // Drop below the Timeline: the strip becomes a wide, short row.
    await dragDockTab(page, gripTab, dockPanel(page, "timeline"), "bottom");

    await expect
      .poll(async () => {
        const box = await strip.boundingBox();
        return box ? box.width > box.height : false;
      })
      .toBe(true);
    // Axis follows the drop with no user input — and the grip survives the
    // move, which is what proves the repositioned tab really was the drag
    // source. Grip and body read the same axis, so both are asserted.
    await expect(toolbar).toHaveAttribute("aria-orientation", "horizontal");
    await expect(grip).toBeVisible();
    await expect(grip).toHaveAttribute("data-orientation", "horizontal");
    // The flip re-aims the thickness cap onto the new axis: a row of buttons
    // keeps one button's HEIGHT, however tall the split it landed in. Polled,
    // not read once: the snap to thickness is a resize of its own, one pass
    // behind the drop — and the next gesture must aim at the settled layout.
    await expect
      .poll(async () => (await strip.boundingBox())?.height ?? Infinity)
      .toBeLessThan(80);

    // Beside the Timeline instead of under it. The cell a side-by-side drop
    // yields is far wider than it is tall, and reading THAT as a row is the
    // trap: width is the only axis its splitter moves, so the bar has to come
    // back as a column — of one button's width, spanning the Timeline row.
    await dragDockTab(page, gripTab, dockPanel(page, "timeline"), "left");

    await expect(toolbar).toHaveAttribute("aria-orientation", "vertical");
    await expect(grip).toHaveAttribute("data-orientation", "vertical");
    await expect
      .poll(async () => (await strip.boundingBox())?.width ?? Infinity)
      .toBeLessThan(80);
    const beside = await strip.boundingBox();
    const timeline = await dockPanel(page, "timeline").boundingBox();
    if (!beside || !timeline) throw new Error("dock has no layout boxes");
    expect(beside.width).toBeLessThan(80);
    expect(beside.x).toBeLessThan(timeline.x);
    // The Timeline keeps its row: a cap aimed at the bar's long axis would have
    // shrink-wrapped the whole row to the bar's thickness instead.
    expect(timeline.height).toBeGreaterThan(80);
  } finally {
    await app.close();
  }
});

/**
 * The bar's thickness is not the user's to drag: the strip's Group is held to
 * `STRIP_THICKNESS` across its short axis, which leaves the splitter beside it
 * with nothing to give and so inert.
 *
 * Only a real grid can show this. The cap is a Dockview constraint, and whether
 * a constraint reaches the sash — whether it survives the theme gap, the
 * overlay-rendered Panel content, and Dockview's own relayout — is exactly what
 * a jsdom test cannot answer. Both halves are asserted because they fail
 * separately: `dv-disabled` is Dockview's own verdict that the view cannot
 * resize, and the gesture proves nothing else quietly resizes it anyway.
 */
test("the Quick Actions bar's thickness resists the splitter beside it", async () => {
  const { app, page } = await launchApp();
  try {
    const parent = tmpDir("weftcut-quick-actions-pin-");
    await newProject(page, {
      parentFolder: parent,
      name: "quick-actions-pin",
      canvas: CANVAS,
    });
    // REQUIRED before any pointer gesture: the splash overlay outlives the
    // first dock render and swallows mousedown while the target is visible.
    await expect(page.locator(".splash-screen")).toHaveCount(0, { timeout: 15_000 });

    const strip = dockPanel(page, "quick-actions");
    const media = dockPanel(page, "media");
    /** The vertical sash nearest the bar's trailing edge — the one a user
     *  reaching for "make this wider" would grab. */
    const sashBesideStrip = () =>
      page.evaluate(() => {
        const bar = document
          .querySelector('.weft-dock-panel[data-panel-kind="quick-actions"]')
          ?.getBoundingClientRect();
        if (!bar) throw new Error("missing Quick Actions strip");
        const nearest = [...document.querySelectorAll<HTMLElement>(".dv-sash")]
          .map((element) => ({
            box: element.getBoundingClientRect(),
            disabled: element.classList.contains("dv-disabled"),
          }))
          .filter((sash) => sash.box.height > sash.box.width)
          .sort(
            (a, b) =>
              Math.abs(a.box.x - bar.right) - Math.abs(b.box.x - bar.right),
          )[0];
        if (!nearest) throw new Error("no vertical sash in the grid");
        return {
          x: nearest.box.x + nearest.box.width / 2,
          y: nearest.box.y + nearest.box.height / 2,
          disabled: nearest.disabled,
        };
      });

    // Settled baseline: a full-height bar of one button's width, and Dockview
    // reporting the splitter against it as unable to move.
    await expect
      .poll(async () => (await sashBesideStrip()).disabled)
      .toBe(true);
    const before = await strip.boundingBox();
    const mediaBefore = await media.boundingBox();
    if (!before || !mediaBefore) throw new Error("dock has no layout boxes");
    expect(before.width).toBeLessThan(80);

    // Haul the splitter a third of the window to the right.
    const sash = await sashBesideStrip();
    await page.mouse.move(sash.x, sash.y);
    await page.mouse.down();
    await page.mouse.move(sash.x + 400, sash.y, { steps: 12 });
    await page.mouse.up();

    // Nothing moved: not the bar, and not the column it would have stolen from.
    const after = await strip.boundingBox();
    const mediaAfter = await media.boundingBox();
    if (!after || !mediaAfter) throw new Error("dock has no layout boxes");
    expect(after.width).toBe(before.width);
    expect(after.x).toBe(before.x);
    expect(mediaAfter.x).toBe(mediaBefore.x);
    expect(mediaAfter.width).toBe(mediaBefore.width);

    // Same haul again, but after pulling a Panel OUT of a shared group — the
    // one drag whose source tab is destroyed by its own drop. The browser then
    // fires `dragend` at a detached node, so a cap that waits for it stays
    // released and the bar is loose for the rest of the session.
    await dragDockTab(page, dockTab(page, "attribute"), media, "left");
    await expect.poll(async () => (await sashBesideStrip()).disabled).toBe(true);

    const reseated = await sashBesideStrip();
    await page.mouse.move(reseated.x, reseated.y);
    await page.mouse.down();
    await page.mouse.move(reseated.x + 400, reseated.y, { steps: 12 });
    await page.mouse.up();

    const afterTabMove = await strip.boundingBox();
    if (!afterTabMove) throw new Error("strip has no layout box");
    expect(afterTabMove.width).toBe(before.width);
    expect(afterTabMove.x).toBe(before.x);
  } finally {
    await app.close();
  }
});

/**
 * Tab chrome is deliberately bare. A Panel tab carries NO close button, and
 * DOCKVIEW's own Close / Close All / Close Others menu never renders on any of
 * them: the workspace passes no `getTabContextMenuItems`
 * (`DockWorkspace.test.tsx` asserts the prop stays undefined). Closing goes
 * through View > Close Active Panel, or — for the tabless Quick Actions strip —
 * the grip's own menu.
 *
 * Two tabs do carry a menu of OUR own, and each is the exception that proves
 * where the line is: the Quick Actions strip has no tab to close from, and a
 * timeline tab names a composition, which is a thing to say something about.
 * Every tab that is only its kind stays bare.
 *
 * All of it is upgrade-fragile: a dockview release that starts rendering its
 * default tab actions would silently put close buttons back on every tab.
 */
test("tabs carry no close chrome, and the Quick Actions grip closes its strip", async () => {
  const { app, page } = await launchApp();
  try {
    const parent = tmpDir("weftcut-dock-menu-");
    await newProject(page, {
      parentFolder: parent,
      name: "dock-tab-menu",
      canvas: CANVAS,
    });
    // REQUIRED before any pointer gesture: the splash overlay outlives the
    // first dock render and swallows mousedown while the target is visible.
    await expect(page.locator(".splash-screen")).toHaveCount(0, { timeout: 15_000 });

    // No tab exposes a close control, solo or grouped.
    await expect(page.locator(".dv-tab button")).toHaveCount(0);
    await expect(page.locator(".dv-default-tab-action")).toHaveCount(0);

    // Dockview's own menu never renders, on any tab shape — the solo one and
    // one inside a shared group. (Timeline is the solo one: Media Pool stopped
    // qualifying when Transitions joined its group.)
    for (const kind of ["timeline", "attribute"]) {
      await dockTab(page, kind).click({ button: "right" });
      await expect(page.locator(".dv-context-menu-item")).toHaveCount(0);
      await page.keyboard.press("Escape");
    }

    // A tab that is only its kind has nothing of ours either.
    await dockTab(page, "attribute").click({ button: "right" });
    await expect(page.locator(".app-menu-list")).toHaveCount(0);

    // A timeline tab does: it names a composition, so it can offer to close
    // that Panel — and, where the composition is placed more than once, to say
    // which placement its times are read against.
    await dockTab(page, "timeline").click({ button: "right" });
    await expect(page.locator(".app-menu-list")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(".app-menu-list")).toHaveCount(0);

    // The grip DOES have a menu, holding exactly one item, and it closes the
    // strip. Every other Panel is left alone.
    await dockTab(page, "quick-actions").click({ button: "right" });
    const gripItems = page.locator(".app-menu-list .app-menu-item");
    await expect(gripItems).toHaveCount(1);
    await expect(gripItems).toHaveText(/Close Panel|关闭面板/);
    await gripItems.click();
    await expect(dockPanel(page, "quick-actions")).toHaveCount(0);
    await expect(dockPanel(page)).toHaveCount(7);
  } finally {
    await app.close();
  }
});

test("closing Preview destroys its resources and reopening creates a new instance", async () => {
  // Fresh userData: this test reopens Preview into its remembered spot, which
  // requires the pristine built-in layout rather than a leaked prior arrangement.
  const { app, page } = await launchApp();
  try {
    const parent = tmpDir("weftcut-dock-life-");
    await newProject(page, {
      parentFolder: parent,
      name: "dock-preview-lifecycle",
      canvas: CANVAS,
    });
    await invokeCmd(page, "add_color_layer", {
      tStartUs: 0,
      durationUs: 1_000_000,
    });

    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as any).__weftcutTest?.previewResourceProbe?.() ?? null,
        ),
      )
      .not.toBeNull();
    const before = await page.evaluate(() =>
      (window as any).__weftcutTest.previewResourceProbe(),
    );

    const viewMenu = page.locator(".menu-trigger").nth(2);
    await viewMenu.click();
    await page.locator(".app-menu-item").filter({ hasText: /^Preview$/ }).click();
    await viewMenu.click();
    await page
      .locator(".app-menu-item")
      .filter({ hasText: /Close Active Panel|关闭活动面板/ })
      .click();

    await expect(page.locator('.weft-dock-panel[data-panel-kind="preview"]')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as any).__weftcutTest.previewResourceProbe(),
        ),
      )
      .toBeNull();

    await viewMenu.click();
    await page.locator(".app-menu-item").filter({ hasText: /^Preview$/ }).click();
    await expect(page.locator('.weft-dock-panel[data-panel-kind="preview"]')).toHaveCount(1);
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as any).__weftcutTest.previewResourceProbe()?.generation ?? null,
        ),
      )
      .not.toBe(before.generation);
  } finally {
    await app.close();
  }
});

test("hidden Preview keeps clock resources alive while presentation sleeps", async () => {
  // Fresh userData: the test drags the Effect tab onto Preview from the known
  // built-in positions; a leaked layout would move those drag targets.
  const { app, page } = await launchApp();
  try {
    const parent = tmpDir("weftcut-dock-hide-");
    await newProject(page, {
      parentFolder: parent,
      name: "dock-preview-hidden",
      canvas: CANVAS,
    });
    await invokeCmd(page, "add_color_layer", {
      tStartUs: 0,
      durationUs: 3_000_000,
    });

    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as any).__weftcutTest?.previewResourceProbe?.() ?? null,
        ),
      )
      .not.toBeNull();
    await page.locator(".transport-buttons button").nth(1).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as any).__weftcutTest.previewResourceProbe()?.playing ?? false,
        ),
      )
      .toBe(true);

    const before = await page.evaluate(() =>
      (window as any).__weftcutTest.previewResourceProbe(),
    );
    // Center-merge onto Preview's content. Native dragTo: the manual
    // mouse-gesture helper does not reliably drive HTML5 center drops on
    // Windows (edge drops are fine — see dragDockTab).
    await dockTab(page, "effect").dragTo(dockPanel(page, "preview"));

    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as any).__weftcutTest.previewResourceProbe()?.visible ?? true,
        ),
      )
      .toBe(false);
    const hidden = await page.evaluate(() =>
      (window as any).__weftcutTest.previewResourceProbe(),
    );
    expect(hidden.generation).toBe(before.generation);

    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as any).__weftcutTest.previewResourceProbe()?.ownerCompositeCount ?? 0,
        ),
      )
      .toBeGreaterThan(hidden.ownerCompositeCount);
    expect(
      await page.evaluate(() =>
        (window as any).__weftcutTest.previewResourceProbe()
          ?.presentedCompositeCount,
      ),
    ).toBe(hidden.presentedCompositeCount);
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as any).__weftcutTest.previewResourceProbe()?.positionUs ?? 0,
        ),
      )
      .toBeGreaterThan(hidden.positionUs);

    await dockTab(page, "preview").click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as any).__weftcutTest.previewResourceProbe()?.visible ?? false,
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as any).__weftcutTest.previewResourceProbe()
            ?.presentedCompositeCount ?? 0,
        ),
      )
      .toBeGreaterThan(hidden.presentedCompositeCount);
    expect(
      await page.evaluate(() =>
        (window as any).__weftcutTest.previewResourceProbe()?.generation,
      ),
    ).toBe(before.generation);
  } finally {
    await app.close();
  }
});

test("Effect card pointer reordering never disturbs the Dock Tree, and Panel tabs never reorder Effects", async () => {
  // Own userData dir: the test moves Panels, and the autosaved current layout
  // must neither read from nor pollute the shared default userData.
  const userDataDir = tmpDir("weftcut-dock-fx-data-");
  const { app, page } = await launchApp({ userDataDir });
  try {
    const parent = tmpDir("weftcut-dock-fx-");
    await newProject(page, {
      parentFolder: parent,
      name: "dock-effect-reorder",
      canvas: CANVAS,
    });

    // A visual Layer carrying a three-effect chain; blur/chromakey are the two
    // catalog kinds, so the chromakey card's color-pick button doubles as a
    // visual order marker inside the Panel.
    const layerId = await invokeCmd<string>(page, "add_color_layer", {
      tStartUs: 0,
      durationUs: 3_000_000,
    });
    const effectIds: string[] = [];
    for (const kind of ["blur", "chromakey", "blur"]) {
      effectIds.push(await invokeCmd<string>(page, "add_effect", { layerId, kind }));
    }
    await page.evaluate(
      (id) => (window as any).__weftcutTest.revealLayer({ layerId: id }),
      layerId,
    );

    const effectOrder = async (): Promise<string[]> => {
      const s = await summary(page);
      for (const track of s.tracks) {
        for (const layer of track.layers as Array<{ id: string; effects?: Array<{ id: string }> }>) {
          if (layer.id === layerId) return (layer.effects ?? []).map((e) => e.id);
        }
      }
      throw new Error("layer not found in summary");
    };
    const panelKinds = async () =>
      (await page
        .locator(".weft-dock-panel[data-panel-kind]")
        .evaluateAll((panels) => panels.map((p) => p.getAttribute("data-panel-kind")))).sort();
    const visibleTabLabels = async () =>
      page
        .locator(".weft-dock-tab-label")
        .evaluateAll((els) =>
          els.filter((el) => el.checkVisibility()).map((el) => el.textContent),
        );

    // Effect opens inactive in the contextual tab group; activate its tab.
    await page.locator(".weft-dock-tab-label", { hasText: "Effect" }).click();
    await page.getByTestId("effect-drag-0").waitFor({ state: "visible" });
    expect(await effectOrder()).toEqual(effectIds);

    // Pointer drag: card 0 (blur) below card 2. The gesture shows a live
    // target but issues no command before the pointer is released.
    const grip = await page.getByTestId("effect-drag-0").boundingBox();
    const lastRow = await page.getByTestId("effect-row-2").boundingBox();
    if (!grip || !lastRow) throw new Error("effect cards not laid out");
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(lastRow.x + 30, lastRow.y + lastRow.height - 2, { steps: 8 });
    await expect(page.getByTestId("effect-row-2")).toHaveClass(/prop-effect-row--drop-after/);
    expect(await effectOrder()).toEqual(effectIds); // nothing committed mid-gesture
    await page.mouse.up();

    const reordered = [effectIds[1]!, effectIds[2]!, effectIds[0]!];
    await expect.poll(effectOrder).toEqual(reordered);

    // One gesture = one undo entry: a single undo restores the original chain.
    await invokeCmd(page, "project_undo", {});
    await expect.poll(effectOrder).toEqual(effectIds);
    await invokeCmd(page, "project_redo", {});
    await expect.poll(effectOrder).toEqual(reordered);

    // The card gesture never touched the Dock Tree. Preview sits solo, so its
    // tab strip (and label) is hidden; every other group's tab shows —
    // including Transitions, tabbed behind the Media Pool in the library group.
    const defaultPanelSet = ["attribute", "effect", "media", "playhead", "preview", "quick-actions", "timeline", "transitions"];
    expect(await panelKinds()).toEqual(defaultPanelSet);
    // Document order, which is the Dock Tree read left-to-right then
    // top-to-bottom: Playhead precedes the inspector because it owns the top of
    // the right column.
    expect(await visibleTabLabels()).toEqual([
      "Media Pool",
      "Transitions",
      "Playhead",
      "Attribute",
      "Effect",
      "Timeline",
    ]);

    // The converse isolation: docking the Effect Panel tab must not reorder
    // the chain. Drop the Effect tab onto Preview's group center — a real
    // merge, which also brings Preview's strip back for tab switching.
    // (Native dragTo: the manual gesture helper is unreliable for HTML5
    // center drops on Windows.)
    await dockTab(page, "effect").dragTo(dockPanel(page, "preview"));
    await expect.poll(async () => (await visibleTabLabels()).sort()).toEqual([
      "Attribute",
      "Effect",
      "Media Pool",
      "Playhead",
      "Preview",
      "Timeline",
      "Transitions",
    ]);
    expect(await panelKinds()).toEqual(defaultPanelSet);
    expect(await effectOrder()).toEqual(reordered);
  } finally {
    await app.close();
  }
});

test("View menu creates a custom Workspace from the current arrangement and switches without a save prompt", async () => {
  // Own userData dir: this test mutates the app-level Workspace document, so it
  // must not read from or pollute the shared default userData.
  const userDataDir = tmpDir("weftcut-ws-ui-data-");
  const { app, page } = await launchApp({ userDataDir });
  try {
    const parent = tmpDir("weftcut-ws-ui-");
    await newProject(page, {
      parentFolder: parent,
      name: "workspace-ui",
      canvas: CANVAS,
    });
    await expect(page.locator(".weft-dock-panel[data-panel-kind]")).toHaveCount(8);

    const viewMenu = page.locator(".menu-trigger").nth(2);
    // Menu labels are localized (the e2e runtime may be en-US or zh-CN); match
    // both. Panel titles and the user-typed Workspace name are not localized.
    // The built-in profile is presented as "Default Layout", not by its
    // "editing" id.
    const builtinItem = /^(Default Layout|默认布局)$/;
    const cuttingItem = /^Cutting$/;
    const menuItem = (text: RegExp) =>
      page.locator(".app-menu-item").filter({ hasText: text });
    /// Profile switching and the Save/Rename/Delete/Reset ops live one level
    /// down, under the Workspaces submenu. Its trigger reuses `.app-menu-item`,
    /// so items are always matched by text, never by index.
    const openWorkspaces = async () => {
      await viewMenu.click();
      await page
        .locator(".app-submenu-trigger")
        .filter({ hasText: /Workspaces|工作区/ })
        .click();
    };

    // Save as New Workspace… → name dialog → a custom Workspace becomes active.
    await openWorkspaces();
    await menuItem(/Save as New Workspace|另存为新工作区/).click();
    await page.getByLabel(/Workspace name|工作区名称/).fill("Cutting");
    await page.getByRole("button", { name: /^(Save|保存)$/ }).click();

    // Close a Panel so the two Workspaces diverge, then confirm it persisted.
    await viewMenu.click();
    // Anchored so it cannot reach "Timeline auto-scroll" in the same menu, and
    // bilingual like its neighbours — the suite runs under either locale.
    await menuItem(/^(Playhead|播放头)$/).click();
    await viewMenu.click();
    await menuItem(/Close Active Panel|关闭活动面板/).click();
    await expect(dockPanel(page, "playhead")).toHaveCount(0);

    // The Workspaces submenu now lists both Workspaces.
    await openWorkspaces();
    await expect(menuItem(cuttingItem)).toHaveCount(1);
    await expect(menuItem(builtinItem)).toHaveCount(1);

    // Switch to the built-in layout — no save prompt — and the full default set
    // returns.
    await menuItem(builtinItem).click();
    await expect(dockPanel(page, "playhead")).toHaveCount(1);

    // Switch back to Cutting: its diverged arrangement (the Playhead Panel closed) is restored.
    await openWorkspaces();
    await menuItem(cuttingItem).click();
    await expect(dockPanel(page, "playhead")).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test("named Workspaces, active selection, and baselines survive a restart", async () => {
  const userDataDir = tmpDir("weftcut-ws-restart-");
  const layout = (kind: string) => ({
    version: 1,
    empty: false,
    dockview: {
      grid: {
        root: { type: "leaf", data: { views: [kind], activeView: kind, id: `g-${kind}` }, size: 100 },
        orientation: "HORIZONTAL",
        width: 1000,
        height: 720,
      },
      panels: {},
      activeGroup: `g-${kind}`,
    },
    placements: {},
  });

  const first = await launchApp({ userDataDir });
  let cutId: string;
  try {
    const parent = tmpDir("weftcut-ws-r1-");
    await newProject(first.page, {
      parentFolder: parent,
      name: "workspace-restart",
      canvas: CANVAS,
    });

    // Save As → a custom profile; then Save promotes a diverged current to baseline.
    const created = await invokeCmd<WorkspaceDocument>(first.page, "workspace_create_profile", {
      name: "Cutting",
      current: layout("timeline"),
    });
    expect(created.profiles.map((p) => p.name)).toEqual(["Editing", "Cutting"]);
    cutId = created.activeId;
    expect(cutId).not.toBe(EDITING_WORKSPACE_ID);

    await invokeCmd(first.page, "workspace_set_current", { current: layout("media") });
    const saved = await invokeCmd<WorkspaceDocument>(first.page, "workspace_save_baseline", {});
    const savedCut = saved.profiles.find((p) => p.id === cutId)!;
    expect(savedCut.saved).toEqual(layout("media"));

    // Switch back to Editing before quitting.
    const switched = await invokeCmd<WorkspaceDocument>(first.page, "workspace_set_active", {
      id: EDITING_WORKSPACE_ID,
    });
    expect(switched.activeId).toBe(EDITING_WORKSPACE_ID);
  } finally {
    await first.app.close();
  }

  // Relaunch over the same userData: the profile, its baseline, and the active
  // selection are all restored from <userData>/workspaces.json.
  const second = await launchApp({ userDataDir });
  try {
    const doc = await invokeCmd<WorkspaceDocument>(second.page, "workspace_get", {});
    expect(doc.activeId).toBe(EDITING_WORKSPACE_ID);
    const cutting = doc.profiles.find((p) => p.id === cutId)!;
    expect(cutting.name).toBe("Cutting");
    expect(cutting.saved).toEqual(layout("media"));

    // Deleting the custom profile leaves only the immutable built-in Editing.
    const afterDelete = await invokeCmd<WorkspaceDocument>(
      second.page,
      "workspace_delete_profile",
      { id: cutId },
    );
    expect(afterDelete.profiles.map((p) => p.id)).toEqual([EDITING_WORKSPACE_ID]);
  } finally {
    await second.app.close();
  }
});
