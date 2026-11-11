import { useRef } from "react";
import type { FC } from "react";
import { Bluetooth, Settings } from "lucide-react";
import { BrandLogo } from "../brand/BrandLogo";
import { openVREntrance, prepareVREntrance } from "../vrEntranceNavigation";

interface ShowroomHeaderProps {
  activeTab?: "FREE PLAY" | "RUDIMENT" | "RHYTHM GAME" | null;
  onNavigate: (tab: "FREE PLAY" | "RUDIMENT" | "RHYTHM GAME") => void;
  onOpenSettings: () => void;
  onHome: () => void;
}

/** Shared live navigation for the showroom and landing page. */
export const ShowroomHeader: FC<ShowroomHeaderProps> = ({ onNavigate, onOpenSettings, onHome, activeTab = "FREE PLAY" }) => {
  const confirmation = useRef<HTMLDialogElement>(null);
  return (
    <>
    <div className="showroom-header-space" aria-hidden="true" />
    <header className="showroom-header">
      <button type="button" className="showroom-logo" aria-label="DRUM UP home" onClick={onHome} style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}><BrandLogo /></button>
      <nav className="showroom-navigation" aria-label="Practice modes">
        <button type="button" className={activeTab === "FREE PLAY" ? "active" : undefined} aria-current={activeTab === "FREE PLAY" ? "page" : undefined} onClick={() => { if (activeTab !== "FREE PLAY") onNavigate("FREE PLAY"); }}>FREE PLAY</button>
        <button type="button" className={activeTab === "RUDIMENT" ? "active" : undefined} aria-current={activeTab === "RUDIMENT" ? "page" : undefined} onClick={() => onNavigate("RUDIMENT")}>RUDIMENT</button>
        <button type="button" className={activeTab === "RHYTHM GAME" ? "active" : undefined} aria-current={activeTab === "RHYTHM GAME" ? "page" : undefined} onClick={() => onNavigate("RHYTHM GAME")}>SONG PRACTICE</button>
        <button type="button" aria-haspopup="dialog" onClick={() => {
          prepareVREntrance();
          confirmation.current?.showModal();
        }}>VR ZONE</button>
      </nav>
      <div className="showroom-header-tools">
        <button type="button" aria-label="Bluetooth and MIDI devices" onClick={onOpenSettings}><Bluetooth size={19} strokeWidth={1.5} /></button>
        <button type="button" aria-label="Settings" onClick={onOpenSettings}><Settings size={19} strokeWidth={1.5} /></button>
      </div>
    </header>
    <dialog ref={confirmation} className="vr-entry-dialog" aria-labelledby="vr-entry-title" aria-describedby="vr-entry-description">
      <h2 id="vr-entry-title">몰입형 VR 경험을 시작하시겠습니까?</h2>
      <p id="vr-entry-description">DRUM UP의 새로운 드럼 연주 공간으로 이동합니다.</p>
      <div className="vr-entry-dialog-actions">
        <button type="button" autoFocus onClick={() => {
          confirmation.current?.close();
          openVREntrance();
        }}>YES</button>
      </div>
    </dialog>
    </>
  );
};
