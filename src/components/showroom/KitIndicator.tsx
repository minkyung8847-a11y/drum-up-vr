import React from "react";

interface KitIndicatorProps {
  currentIndex: number;
  totalKits: number;
  onSelectIndex: (index: number) => void;
}

export const KitIndicator: React.FC<KitIndicatorProps> = ({
  currentIndex,
  totalKits,
  onSelectIndex,
}) => {
  const currentFormatted = String(currentIndex + 1).padStart(2, "0");
  const totalFormatted = String(totalKits).padStart(2, "0");

  return (
    <footer className="showroom-footer">
      <div className="showroom-counter-group">
        <span className="showroom-counter-text">
          {currentFormatted} &nbsp;/&nbsp; {totalFormatted}
        </span>
        <div className="showroom-progress-bars" aria-label="Progress Bar Indicator">
          {Array.from({ length: totalKits }).map((_, idx) => (
            <span
              key={idx}
              className={`showroom-progress-bar ${idx === currentIndex ? "active" : ""}`}
              onClick={() => onSelectIndex(idx)}
              title={`Go to kit ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      <div className="showroom-footer-right">
        <span className="showroom-footer-line" />
        <span className="showroom-footer-tagline">
          MORE DRUMS<br />MORE YOU
        </span>
      </div>
    </footer>
  );
};
