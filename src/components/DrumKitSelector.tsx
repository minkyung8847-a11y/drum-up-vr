import React, { useState, useEffect, useRef } from "react";
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
}

export const DrumKitSelector: React.FC<DrumKitSelectorProps> = ({
  currentKitId,
  onSelectKit,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<DrumKitCategory>("All");
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

  const filteredKits =
    selectedCategory === "All"
      ? DRUM_KITS
      : DRUM_KITS.filter((kit) => kit.category === selectedCategory);

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
        <span className="drum-kit-toggle-btn">
          {isOpen ? "▲" : "▼"}
        </span>
      </div>

      <div className="drum-kit-current-info">
        <span className="drum-kit-id-pill">{currentKit.id}</span>
        <h2 className="drum-kit-title">{currentKit.name}</h2>
        <span className="drum-kit-category-tag">{currentKit.category}</span>
      </div>

      {isOpen && !disabled && (
        <div
          className="drum-kit-dropdown"
          onClick={(e) => e.stopPropagation()}
        >
          {/* CATEGORY FILTER CHIPS */}
          <div className="drum-kit-cat-bar">
            {DRUM_KIT_CATEGORIES.map((cat) => (
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
      )}
    </div>
  );
};
