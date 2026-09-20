import React from "react";
import type { ShowroomDrumKit } from "../../config/showroomKits";

interface DrumKitVisualProps {
  kit: ShowroomDrumKit;
  isActive: boolean;
  onAudition?: () => void;
}

export const DrumKitVisual: React.FC<DrumKitVisualProps> = ({ kit, isActive, onAudition }) => (
  <button
    type="button"
    className="showroom-drum-img-wrapper"
    onClick={onAudition}
    tabIndex={isActive ? 0 : -1}
    disabled={!isActive}
    aria-label={`Preview ${kit.displayName} drum sound`}
    title="Click to audition sound"
  >
    <img src={kit.image} alt={`${kit.displayName} drum kit`} className="showroom-drum-img" draggable={false} />
  </button>
);
