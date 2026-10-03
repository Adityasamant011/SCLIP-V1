import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StartupProgress } from "./initializeRenderer";

interface Props {
  /** Whether every launch dependency has settled and the destination is ready. */
  ready: boolean;
  /** Disable automatic exit when development preview is manually held open. */
  autoComplete?: boolean;
  startupProgress: StartupProgress | null;
  routePending: boolean;
  /**
   * Fires once when the intro motion finishes and the splash starts holding
   * its completed mark. Heavy launch destinations mount on this signal so
   * their long tasks land in the hold phase instead of mid-motion.
   */
  onIntroComplete?: () => void;
  onComplete: () => void;
}

const SPLASH_INTRO_DURATION_MS = 2600;
const SPLASH_EXIT_DURATION_MS = 200;
const REDUCED_MOTION_INTRO_DURATION_MS = 120;
const REDUCED_MOTION_EXIT_DURATION_MS = 120;

/**
 * The Sclip launch screen plays the smooth center-reveal animation from
 * public/splash/sclip_splash.mp4 (with poster / gif fallback), displaying
 * the monochrome hexagonal S brand mark.
 */
export function SplashScreen({
  ready,
  autoComplete = true,
  startupProgress,
  routePending,
  onIntroComplete,
  onComplete,
}: Props) {
  const { t } = useTranslation();
  const [reduceMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
  );
  const [introComplete, setIntroComplete] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => {
        setIntroComplete(true);
        onIntroComplete?.();
      },
      reduceMotion
        ? REDUCED_MOTION_INTRO_DURATION_MS
        : SPLASH_INTRO_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [reduceMotion, onIntroComplete]);

  const exiting = introComplete && ready && autoComplete;

  useEffect(() => {
    if (!exiting) return;
    const timeout = window.setTimeout(
      onComplete,
      reduceMotion
        ? REDUCED_MOTION_EXIT_DURATION_MS
        : SPLASH_EXIT_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [exiting, onComplete, reduceMotion]);

  const phase = exiting ? "exiting" : introComplete ? "waiting" : "intro";
  const pendingChecks = startupProgress?.pending ?? [];
  const statusText = !startupProgress
    ? t("splash.starting")
    : pendingChecks.length > 0
      ? t("splash.checking", {
          items: pendingChecks
            .map((check) => t(`splash.check.${check}`))
            .join(t("splash.check_separator")),
        })
      : routePending
        ? t("splash.resolving_project")
        : t("splash.ready");

  return (
    <div
      className={`splash-screen splash-screen-${phase}${introComplete ? " splash-screen-pulsing" : ""}`}
      data-drag-region
      role="status"
      aria-busy={!ready}
      aria-atomic="true"
    >
      <div className="splash-mark" aria-hidden="true">
        <video
          className="splash-video"
          src="./splash/sclip_splash.mp4"
          poster="./splash/sclip_splash.gif"
          autoPlay
          muted
          playsInline
        >
          <img
            className="splash-video-fallback"
            src="./splash/sclip_splash.gif"
            alt="Sclip"
          />
        </video>
      </div>
      <div className="splash-copy">
        <div className="splash-wordmark">Sclip</div>
        <div className="splash-progress">
          <span className="splash-progress-dot" aria-hidden="true" />
          <span className="splash-progress-message">{statusText}</span>
          {startupProgress && pendingChecks.length > 0 && (
            <span className="splash-progress-count" aria-hidden="true">
              {startupProgress.completed}/{startupProgress.total}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
