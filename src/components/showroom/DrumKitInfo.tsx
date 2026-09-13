import React from "react";
import type { ShowroomDrumKit } from "../../config/showroomKits";

interface DrumKitInfoProps {
  kit: ShowroomDrumKit;
}

export const DrumKitInfo: React.FC<DrumKitInfoProps> = ({ kit }) => {
  return (
    <div className="showroom-info" key={kit.id}>
      <span className="showroom-label">D R U M &nbsp; K I T &nbsp; S E L E C T I O N</span>
      <h1 className="showroom-title">{kit.name}</h1>
      <p className="showroom-tagline">{kit.tagline}</p>
    </div>
  );
};
