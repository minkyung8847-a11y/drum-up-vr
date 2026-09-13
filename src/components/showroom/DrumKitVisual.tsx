import React, { useState, useCallback } from "react";
import type { ShowroomDrumKit } from "../../config/showroomKits";

interface DrumKitVisualProps {
  kit: ShowroomDrumKit;
  isActive: boolean;
  onAudition?: () => void;
}

export const DrumKitVisual: React.FC<DrumKitVisualProps> = ({ kit, isActive, onAudition }) => {
  const [tilt, setTilt] = useState<{ rx: number; ry: number }>({ rx: 0, ry: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isActive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    // Limit to ±3.5deg on Y and ±2.2deg on X
    const ry = (x / (rect.width / 2)) * 3.5;
    const rx = -(y / (rect.height / 2)) * 2.2;
    setTilt({ rx, ry });
  }, [isActive]);

  const handleMouseLeave = useCallback(() => {
    setTilt({ rx: 0, ry: 0 });
  }, []);

  return (
    <div
      className="showroom-drum-img-wrapper"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onAudition}
      style={{
        transform: isActive
          ? `perspective(1200px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`
          : undefined,
      }}
      title={isActive ? "Click to audition sound" : undefined}
    >
      {/* Floor Spotlight */}
      <div className="showroom-spotlight" />

      {/* Main Drum Kit Visual */}
      <img
        src={kit.image}
        alt={`${kit.name} Drum Kit`}
        className="showroom-drum-img"
        draggable={false}
      />

      {/* Subtle Ground Reflection */}
      <img
        src={kit.image}
        alt=""
        aria-hidden="true"
        className="showroom-drum-reflection"
        draggable={false}
      />
    </div>
  );
};
