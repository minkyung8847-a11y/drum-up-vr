import React from "react";
import { BrandLogo } from "../brand/BrandLogo";
import { User } from "lucide-react";

interface DrumKitNavProps {
  activeNav: "HOME" | "DRUM KITS" | "PLAY" | "SESSIONS" | "SETTINGS";
  onNavigate: (tab: "HOME" | "DRUM KITS" | "PLAY" | "SESSIONS" | "SETTINGS") => void;
}

export const DrumKitNav: React.FC<DrumKitNavProps> = ({ activeNav, onNavigate }) => {
  return (
    <header className="showroom-header">
      <div className="showroom-header-left">
        <button
          type="button"
          className="showroom-logo-btn"
          onClick={() => onNavigate("HOME")}
          title="DRUM UP Home"
        >
          <BrandLogo />
        </button>
      </div>

      <nav className="showroom-header-nav" aria-label="Showroom Navigation">
        {(["HOME", "DRUM KITS", "PLAY", "SESSIONS", "SETTINGS"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={`showroom-nav-link ${activeNav === item ? "active" : ""}`}
            onClick={() => onNavigate(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      <div className="showroom-header-right">
        <div className="showroom-tagline-block">
          <span className="showroom-tagline-line" />
          <span className="showroom-tagline-text">
            RHYTHM<br />CONNECTS US
          </span>
        </div>
        <button
          type="button"
          className="showroom-profile-btn"
          title="User Account"
          aria-label="User Account"
        >
          <User size={16} />
        </button>
      </div>
    </header>
  );
};
