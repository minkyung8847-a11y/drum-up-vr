import React from "react";
import type { ShowroomDrumKit } from "../../config/showroomKits";

interface DrumKitInfoProps {
  kit: ShowroomDrumKit;
}

export const DrumKitInfo: React.FC<DrumKitInfoProps> = ({ kit }) => {
  return (
    <div className="showroom-info">
      <h1 className="showroom-title" aria-live="polite" aria-atomic="true">
        {kit.name}
      </h1>
      {kit.tagline && <p className="showroom-tagline">{kit.tagline}</p>}
    </div>
  );
};
