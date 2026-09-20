import React from "react";
import type { ShowroomDrumKit } from "../../config/showroomKits";

interface DrumKitThumbnailsProps {
  kits: ShowroomDrumKit[];
  activeIndex: number;
  onSelectKit: (index: number) => void;
}

export const DrumKitThumbnails: React.FC<DrumKitThumbnailsProps> = ({
  kits,
  activeIndex,
  onSelectKit,
}) => {
  return (
    <div className="showroom-thumbnails-strip" role="group" aria-label="Drum kit selection">
      {kits.map((kit, idx) => {
        const isActive = idx === activeIndex;
        return (
          <button
            key={kit.id}
            type="button"
            aria-pressed={isActive}
            className={`showroom-thumb-card ${isActive ? "active" : ""}`}
            onClick={() => onSelectKit(idx)}
            title={`Select ${kit.displayName} Kit`}
          >
            <div className="thumb-icon-box">
              <img
                src={kit.thumbnail || kit.image}
                alt={kit.displayName}
                className="thumb-icon-img"
                draggable={false}
              />
            </div>
            <span className="thumb-name">{kit.displayName}</span>
          </button>
        );
      })}
    </div>
  );
};
