export interface ShowroomDrumKit {
  id: "standard" | "room" | "rock" | "jazz" | "brush" | "electronic";
  index: number;
  code: string;
  name: string;
  displayName: string;
  tagline: string;
  description: string;
  image: string;
  thumbnail: string;
  cardImage: string;
  audioPresetId: string;
  character: {
    shell: string;
    cymbals: string;
    tone: string;
  };
}

export const SHOWROOM_DRUM_KITS: ShowroomDrumKit[] = [
  {
    id: "standard",
    index: 0,
    code: "01",
    name: "STANDARD",
    displayName: "Standard",
    tagline: "Balanced / Natural / All-round",
    description: "Classic acoustic configuration with warm amber wood shells and balanced cymbals. Ideal for wide dynamic ranges and versatile rhythm foundations.",
    image: "/assets/drums/standard.webp",
    thumbnail: "/assets/drums/standard_thumb.webp",
    cardImage: "/assets/drums/standard_card.webp",
    audioPresetId: "001",
    character: {
      shell: "Warm Lacquered Amber Maple",
      cymbals: "Traditional Cast Bronze",
      tone: "Balanced & Open",
    },
  },
  {
    id: "room",
    index: 1,
    code: "02",
    name: "ROOM",
    displayName: "Room",
    tagline: "Warm / Spacious / Live",
    description: "Natural birch shells recorded in an acoustic live studio. Delivers lush room reflections with open resonance and natural ambience.",
    image: "/assets/drums/room.webp",
    thumbnail: "/assets/drums/room_thumb.webp",
    cardImage: "/assets/drums/room_card.webp",
    audioPresetId: "101",
    character: {
      shell: "Natural Studio Birch Finish",
      cymbals: "Wide Air-Vented Studio Bronze",
      tone: "Warm & Spacious",
    },
  },
  {
    id: "rock",
    index: 2,
    code: "03",
    name: "ROCK",
    displayName: "Rock",
    tagline: "Powerful / Heavy / Dynamic",
    description: "Aggressive deep black shells with oversized kick and penetrating snare crack. Engineered for driving tempos and heavy velocity impact.",
    image: "/assets/drums/rock.webp",
    thumbnail: "/assets/drums/rock_thumb.webp",
    cardImage: "/assets/drums/rock_card.webp",
    audioPresetId: "201",
    character: {
      shell: "Deep Gloss Onyx Black Oak",
      cymbals: "Heavy Hammered Rock Alloy",
      tone: "Punchy & Saturated",
    },
  },
  {
    id: "jazz",
    index: 3,
    code: "04",
    name: "JAZZ",
    displayName: "Jazz",
    tagline: "Warm / Detailed / Acoustic",
    description: "Compact bop-style acoustic drum set featuring high tuning, delicate stick definition on the ride cymbal, and warm woody rim sensitivity.",
    image: "/assets/drums/jazz.webp",
    thumbnail: "/assets/drums/jazz_thumb.webp",
    cardImage: "/assets/drums/jazz_card.webp",
    audioPresetId: "301",
    character: {
      shell: "Vintage Satin Walnut",
      cymbals: "Hand-Hammered Dark Ride",
      tone: "Articulate & Woody",
    },
  },
  {
    id: "brush",
    index: 4,
    code: "05",
    name: "BRUSH",
    displayName: "Brush",
    tagline: "Soft / Intimate / Smooth",
    description: "Muted champagne finish with coated heads tuned for brush sweeps and sensitive feathering. Intimate, smooth acoustic character.",
    image: "/assets/drums/brush.webp",
    thumbnail: "/assets/drums/brush_thumb.webp",
    cardImage: "/assets/drums/brush_card.webp",
    audioPresetId: "401",
    character: {
      shell: "Aged Champagne Sparkle",
      cymbals: "Thin Paper-Light Crash/Ride",
      tone: "Velvety & Intimate",
    },
  },
  {
    id: "electronic",
    index: 5,
    code: "06",
    name: "ELECTRONIC",
    displayName: "Electronic",
    tagline: "Modern / Precise / Experimental",
    description: "Futuristic black mesh trigger pads with vibrant DRUM UP brand orange accent rings. Crisp synthesized transients and punchy sub-bass.",
    image: "/assets/drums/electronic.webp",
    thumbnail: "/assets/drums/electronic_thumb.webp",
    cardImage: "/assets/drums/electronic_card.webp",
    audioPresetId: "402",
    character: {
      shell: "Anodized Matte Aluminum & Mesh",
      cymbals: "Low-Profile Trigger Discs",
      tone: "Digital Transients & Sub-Low",
    },
  },
];
