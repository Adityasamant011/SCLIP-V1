// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { SplashScreen } from "./SplashScreen";
import type { StartupProgress } from "./initializeRenderer";

const READY_PROGRESS: StartupProgress = {
  pending: [],
  completed: 4,
  total: 4,
};
const READY_STATUS_PROPS = {
  startupProgress: READY_PROGRESS,
  routePending: false,
};

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  await i18n.changeLanguage("en-US");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SplashScreen launch mark", () => {
  it("renders the Sclip splash media and wordmark", () => {
    const { container } = render(
      <SplashScreen {...READY_STATUS_PROPS} ready onComplete={() => {}} />,
    );

    const mark = container.querySelector(".splash-mark");
    expect(mark).not.toBeNull();
    const video = mark?.querySelector("video.splash-video");
    expect(video?.getAttribute("src")).toBe("./splash/sclip_splash.mp4");
    expect(container.querySelector(".splash-wordmark")?.textContent).toBe("Sclip");
  });

  it("shows the checks that are currently keeping startup open", () => {
    const { container, rerender } = render(
      <SplashScreen
        ready={false}
        startupProgress={{
          pending: ["evaluation_runtime", "motif_catalog"],
          completed: 2,
          total: 4,
        }}
        routePending
        onComplete={() => {}}
      />,
    );

    expect(
      container.querySelector(".splash-progress-message")?.textContent,
    ).toBe("Checking: evaluation engine · Motif catalog");
    expect(container.querySelector(".splash-progress-count")?.textContent).toBe(
      "2/4",
    );

    rerender(
      <SplashScreen
        ready={false}
        startupProgress={READY_PROGRESS}
        routePending
        onComplete={() => {}}
      />,
    );
    expect(
      container.querySelector(".splash-progress-message")?.textContent,
    ).toBe("Checking the launch project…");
  });

  it("holds the completed mark until launch dependencies are ready", () => {
    const onComplete = vi.fn();
    const { container, rerender } = render(
      <SplashScreen
        {...READY_STATUS_PROPS}
        ready={false}
        onComplete={onComplete}
      />,
    );

    act(() => vi.advanceTimersByTime(5000));

    expect(onComplete).not.toHaveBeenCalled();
    expect(
      container.firstElementChild?.classList.contains("splash-screen-waiting"),
    ).toBe(true);
    expect(
      container.firstElementChild?.classList.contains("splash-screen-pulsing"),
    ).toBe(true);

    rerender(
      <SplashScreen {...READY_STATUS_PROPS} ready onComplete={onComplete} />,
    );
    expect(
      container.firstElementChild?.classList.contains("splash-screen-exiting"),
    ).toBe(true);

    act(() => vi.advanceTimersByTime(199));
    expect(onComplete).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("keeps the full intro when dependencies finish early", () => {
    const onComplete = vi.fn();
    const { container } = render(
      <SplashScreen {...READY_STATUS_PROPS} ready onComplete={onComplete} />,
    );

    act(() => vi.advanceTimersByTime(2599));
    expect(onComplete).not.toHaveBeenCalled();
    expect(
      container.firstElementChild?.classList.contains("splash-screen-intro"),
    ).toBe(true);

    act(() => vi.advanceTimersByTime(1));
    expect(
      container.firstElementChild?.classList.contains("splash-screen-exiting"),
    ).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(200));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("signals intro completion exactly when the motion finishes", () => {
    const onIntroComplete = vi.fn();
    render(
      <SplashScreen
        {...READY_STATUS_PROPS}
        ready={false}
        onIntroComplete={onIntroComplete}
        onComplete={() => {}}
      />,
    );

    act(() => vi.advanceTimersByTime(2599));
    expect(onIntroComplete).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onIntroComplete).toHaveBeenCalledOnce();

    // Still held (not ready) — the signal is about the motion, not the exit.
    act(() => vi.advanceTimersByTime(5000));
    expect(onIntroComplete).toHaveBeenCalledOnce();
  });

  it("stays open for a manually controlled development preview", () => {
    const onComplete = vi.fn();
    const { container } = render(
      <SplashScreen
        {...READY_STATUS_PROPS}
        ready
        autoComplete={false}
        onComplete={onComplete}
      />,
    );

    act(() => vi.advanceTimersByTime(5000));

    expect(onComplete).not.toHaveBeenCalled();
    expect(
      container.firstElementChild?.classList.contains("splash-screen-waiting"),
    ).toBe(true);
    expect(container.firstElementChild?.getAttribute("aria-busy")).toBe(
      "false",
    );
  });
});
