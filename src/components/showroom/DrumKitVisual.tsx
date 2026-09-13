import React, { useState, useCallback } from "react";
import type { ShowroomDrumKit } from "../../config/showroomKits";

interface DrumKitVisualProps {
  kit: ShowroomDrumKit;
  isActive: boolean;
  onAudition?: () => void;
}

export const DrumKitVisual: React.FC<DrumKitVisualProps> = ({ kit, isActive, onAudition }) => {
  const [tilt, setTilt] = useState<{ rx: number; ry: number }>({ rx: 0, ry: 0 });

  // Subtle Parallax (center kit only: rotateY ±2.0deg, rotateX ±1.0deg)
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isActive) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      const ry = (x / (rect.width / 2)) * 2.0;
      const rx = -(y / (rect.height / 2)) * 1.0;
      setTilt({ rx, ry });
    },
    [isActive]
  );

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
      {/* Studio Floor Spotlight */}
      <div className="showroom-spotlight" />

      {/* Decoupled Dynamic Floor Shadow */}
      <div className="showroom-floor-shadow" aria-hidden="true" />

      {/* Main Transparent Drum Kit Visual */}
      <picture>
        <source srcSet={kit.image} type="image/webp" />
        <img
          src={kit.image.replace(".webp", ".png")}
          alt={`${kit.name} Drum Kit`}
          className="showroom-drum-img"
          draggable={false}
        />
      </picture>
    </div>
  );
};
