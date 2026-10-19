import React from "react";
import { Bluetooth, Settings } from "lucide-react";
import { BrandLogo } from "../brand/BrandLogo";

interface ShowroomHeaderProps {
  activeTab?: "FREE PLAY" | "RUDIMENT" | "RHYTHM GAME" | null;
  onNavigate: (tab: "FREE PLAY" | "RUDIMENT" | "RHYTHM GAME") => void;
  onOpenSettings: () => void;
  onHome: () => void;
}

/** Shared live navigation for the showroom and landing page. */
export const ShowroomHeader: React.FC<ShowroomHeaderProps> = ({ onNavigate, onOpenSettings, onHome, activeTab = "FREE PLAY" }) => (
  <>
  <div className="showroom-header-space" aria-hidden="true" />
  <header className="showroom-header">
    <button type="button" className="showroom-logo" aria-label="DRUM UP home" onClick={onHome} style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}><BrandLogo /></button>
    <nav className="showroom-navigation" aria-label="Practice modes">
      <button type="button" className={activeTab === "FREE PLAY" ? "active" : undefined} aria-current={activeTab === "FREE PLAY" ? "page" : undefined} onClick={() => { if (activeTab !== "FREE PLAY") onNavigate("FREE PLAY"); }}>FREE PLAY</button>
      <button type="button" className={activeTab === "RUDIMENT" ? "active" : undefined} aria-current={activeTab === "RUDIMENT" ? "page" : undefined} onClick={() => onNavigate("RUDIMENT")}>RUDIMENT</button>
      <button type="button" className={activeTab === "RHYTHM GAME" ? "active" : undefined} aria-current={activeTab === "RHYTHM GAME" ? "page" : undefined} onClick={() => onNavigate("RHYTHM GAME")}>SONG PRACTICE</button>
    </nav>
    <div className="showroom-header-tools">
      <button type="button" aria-label="Bluetooth and MIDI devices" onClick={onOpenSettings}><Bluetooth size={19} strokeWidth={1.5} /></button>
      <button type="button" aria-label="Settings" onClick={onOpenSettings}><Settings size={19} strokeWidth={1.5} /></button>
    </div>
  </header>
  </>
);
