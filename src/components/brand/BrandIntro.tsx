import { ShowroomHeader } from "../showroom/ShowroomHeader";
import "./brandIntro.css";

interface LandingPageProps {
  onNavigate: (tab: "FREE PLAY" | "RUDIMENT" | "RHYTHM GAME") => void;
  onOpenSettings: () => void;
  onHome: () => void;
  onOpenShowroom: () => void;
}

/** Immediate landing page using the supplied artwork and the existing live header. */
export function LandingPage({ onNavigate, onOpenSettings, onHome, onOpenShowroom }: LandingPageProps) {
  return (
    <main className="brand-landing" aria-label="DRUM UP home">
      <div className="brand-landing-visual">
        <img src={`${import.meta.env.BASE_URL}brand/landing-main.png`} alt="Orange acoustic drum kit with chrome hardware and glowing orange light trails" fetchPriority="high" draggable={false} />
        <svg className="brand-drum-hit-area" viewBox="0 0 1670 942" role="button" tabIndex={0}
          aria-label="Choose a drum kit" onClick={onOpenShowroom}
          onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenShowroom(); } }}>
          {/* Follow the product silhouette in source-image coordinates, including its cymbals and stands. */}
          <path d="M414 126 C462 90 713 154 797 249 C858 350 582 302 433 210 Z
            M1163 270 C1203 213 1442 167 1505 213 C1554 269 1311 365 1170 350 Z
            M440 348 L543 334 L658 376 L640 421 L479 412 Z
            M1340 473 L1457 485 L1503 514 L1429 532 L1321 515 Z
            M758 327 L857 302 L1014 324 L1038 376 L1177 368 L1221 454 L1225 526
            L1323 564 L1390 688 L1455 942 L302 942 L339 736 L349 571 L428 493
            L531 472 L667 499 L741 543 Z
            M445 155 L466 157 L434 520 L390 625 L229 942 L119 942 L310 609 L379 481 Z
            M1353 264 L1372 266 L1370 671 L1546 942 L1521 942 L1358 713 L1307 942 L1290 942 L1347 666 Z" />
        </svg>
      </div>
      <ShowroomHeader activeTab={null} onNavigate={onNavigate} onOpenSettings={onOpenSettings} onHome={onHome} />
    </main>
  );
}
