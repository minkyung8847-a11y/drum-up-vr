import React, { useState, useEffect, useRef } from "react";
import { ChevronUp, Store } from "lucide-react";
import {
  DRUM_KITS,
  DRUM_KITS_MAP,
  DRUM_KIT_CATEGORIES,
  type DrumKitCategory,
} from "../config/drumKits";
import { drumSynth } from "../utils/synth";

interface DrumKitSelectorProps {
  currentKitId: string;
  onSelectKit: (kitId: string) => void;
  disabled?: boolean;
  onOpenShowroom?: () => void;
  variant?: "card" | "bottom";
}

export const DrumKitSelector: React.FC<DrumKitSelectorProps> = ({
  currentKitId,
  onSelectKit,
  disabled = false,
  onOpenShowroom,
  variant = "card",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<DrumKitCategory>(
    (DRUM_KITS_MAP[currentKitId] || DRUM_KITS[0]).category as DrumKitCategory,
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const currentKit = DRUM_KITS_MAP[currentKitId] || DRUM_KITS[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // No "All" tab, and only primary kits: names with a parenthesised variant are hidden from the list.
  const categories = DRUM_KIT_CATEGORIES.filter((cat) => cat !== "All");
  const filteredKits = DRUM_KITS.filter(
    (kit) => kit.category === selectedCategory && !kit.name.includes("("),
  );

  const handleSelect = (kitId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    onSelectKit(kitId);
    setIsOpen(false);

    // Quick audition sound on select
    try {
      drumSynth.trigger("snare", 0.85);
    } catch {}
  };

  const handleAudition = (kitId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    drumSynth.setKit(kitId);
    drumSynth.trigger("snare", 0.9);
    if (kitId !== currentKitId) {
      onSelectKit(kitId);
    }
  };

  const isBottom = variant === "bottom";
  // One dropdown shared by the sidebar card and the bottom-left control (the latter opens upward via CSS).
  const dropdown = isOpen && !disabled && (
        <div
          className={`drum-kit-dropdown${isBottom ? " drum-kit-dropdown-up" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* CATEGORY FILTER CHIPS */}
          <div className="drum-kit-cat-bar">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`drum-kit-cat-chip ${selectedCategory === cat ? "active" : ""}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* PRESETS LIST */}
          <div className="drum-kit-list-scroll">
            {filteredKits.map((kit) => {
              const isSelected = kit.id === currentKitId;
              return (
                <div
                  key={kit.id}
                  className={`drum-kit-item ${isSelected ? "selected" : ""}`}
                  onClick={(e) => handleSelect(kit.id, e)}
                >
                  <div className="drum-kit-item-left">
                    <span className="drum-kit-item-id">{kit.id}</span>
                    <div className="drum-kit-item-text">
                      <div className="drum-kit-item-name">{kit.name}</div>
                      <div className="drum-kit-item-cat">{kit.category}</div>
                    </div>
                  </div>

                  <div className="drum-kit-item-actions">
                    <button
                      type="button"
                      className="drum-kit-audition-btn"
                      title="소리 미리듣기"
                      onClick={(e) => handleAudition(kit.id, e)}
                    >
                      ▶
                    </button>
                    {isSelected && <span className="drum-kit-check-icon">✓</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
  );

  if (isBottom) {
    return (
      <div ref={containerRef} className="glass-panel drum-kit-bottom">
        <button type="button" className="drum-kit-bottom-icon" onClick={onOpenShowroom} aria-label="Open drum kit selection" title="드럼 키트 선택 페이지 열기"><Store size={22} strokeWidth={1.5} /></button>
        <div className="drum-kit-bottom-text">
          <span className="drum-kit-bottom-label">DRUM KIT</span>
          <button type="button" className="drum-kit-bottom-current" onClick={() => { if (!disabled) setIsOpen(!isOpen); }} aria-expanded={isOpen} title="드럼 사운드 프리셋 변경">
            {currentKit.name.toUpperCase()}
            <ChevronUp size={16} strokeWidth={2} />
          </button>
        </div>
        {dropdown}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`glass-panel drum-kit-card ${isOpen ? "dropdown-active" : ""} ${
        disabled ? "disabled" : ""
      }`}
      onClick={() => {
        if (!disabled) setIsOpen(!isOpen);
      }}
      title="드럼 사운드 프리셋 변경"
    >
      <div className="drum-kit-card-header">
        <span className="control-label">DRUM KIT / SOUND PRESET</span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {onOpenShowroom && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenShowroom();
              }}
              style={{
                background: "rgba(255, 109, 45, 0.12)",
                border: "1px solid rgba(255, 109, 45, 0.35)",
                color: "#FF6D2D",
                fontSize: "10px",
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: "4px",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title="3D 악기 쇼룸 열기"
            >
              쇼룸 ↗
            </button>
          )}
          <span className="drum-kit-toggle-btn">
            {isOpen ? "▲" : "▼"}
          </span>
        </div>
      </div>

      <div className="drum-kit-current-info">
        <span className="drum-kit-id-pill">{currentKit.id}</span>
        <h2 className="drum-kit-title">{currentKit.name}</h2>
        <span className="drum-kit-category-tag">{currentKit.category}</span>
      </div>

      {dropdown}
    </div>
  );
};
