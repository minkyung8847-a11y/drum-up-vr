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
    <div className="showroom-thumbnails-strip" role="tablist" aria-label="Drum Kit Selection Thumbnails">
      {kits.map((kit, idx) => {
        const isActive = idx === activeIndex;
        return (
          <button
            key={kit.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`showroom-thumb-card ${isActive ? "active" : ""}`}
            onClick={() => onSelectKit(idx)}
            title={`Select ${kit.displayName} Kit`}
          >
            <div className="thumb-image-container">
              <img
                src={kit.thumbnail || kit.image}
                alt={kit.displayName}
                className="thumb-image"
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
