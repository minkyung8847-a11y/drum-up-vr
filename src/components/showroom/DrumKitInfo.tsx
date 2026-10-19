import React from "react";
import type { ShowroomDrumKit } from "../../config/showroomKits";

interface DrumKitInfoProps {
  kit: ShowroomDrumKit;
}

const STANDARD_DESCRIPTION = "A balanced and versatile kit for all-around playing. Perfect for practice, band sessions, and any genre.";
const KIT_DESCRIPTION_LINES: Record<ShowroomDrumKit["id"], [string, string]> = {
  standard: ["A balanced and versatile kit for all-around playing.", "Perfect for practice, band sessions, and any genre."],
  room: ["A warm and spacious kit with natural studio depth.", "Perfect for open grooves, live sessions, and practice."],
  rock: ["A bold and powerful kit with deep kicks and attack.", "Built for driving rhythms, heavy hits, and live shows."],
  jazz: ["A warm and expressive kit with delicate definition.", "Perfect for swing, subtle accents, and improvised play."],
  brush: ["A soft and intimate kit with smooth brush textures.", "Ideal for gentle grooves, quiet sessions, and ballads."],
  electronic: ["A crisp and modern kit with punchy electronic tones.", "Built for bold beats, deep bass, and creative rhythms."],
};

export const DrumKitInfo: React.FC<DrumKitInfoProps> = ({ kit }) => {
  return (
    <div className="showroom-info">
      <h1 className="showroom-title" aria-live="polite" aria-atomic="true">
        {kit.name}
      </h1>
      <div className="showroom-description-area">
        {/* Reserve STANDARD's responsive height independently of the selected copy. */}
        <p className="showroom-tagline showroom-description-reference" aria-hidden="true">{STANDARD_DESCRIPTION}</p>
        <p className="showroom-tagline showroom-description-copy">
          {KIT_DESCRIPTION_LINES[kit.id][0]}<br />{KIT_DESCRIPTION_LINES[kit.id][1]}
        </p>
      </div>
    </div>
  );
};
