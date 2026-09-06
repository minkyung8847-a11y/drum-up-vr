// Automatically generated from Music Hobby -Drum Kit library
export interface DrumSoundRegion {
  key: number;
  offset: number;
  end: number;
  label?: string;
}

export interface DrumKitSounds {
  kick: DrumSoundRegion;
  snare: DrumSoundRegion;
  hiHatClosed: DrumSoundRegion;
  hiHatPedal: DrumSoundRegion;
  hiHatOpen: DrumSoundRegion;
  tom1: DrumSoundRegion;
  tom2: DrumSoundRegion;
  floorTom: DrumSoundRegion;
  crash: DrumSoundRegion;
  ride: DrumSoundRegion;
}

export interface DrumKitPreset {
  id: string;
  name: string;
  category: string;
  fileName: string;
  sounds: DrumKitSounds;
  regions: Record<number, DrumSoundRegion>;
}

export const DRUM_KITS: DrumKitPreset[] = [
  {
    "id": "001",
    "name": "Standard 1",
    "category": "Standard",
    "fileName": "001 - Standard 1.sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 145860,
        "end": 152863,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 3439800,
        "end": 3572099,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 3836700,
        "end": 3968999,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 3969000,
        "end": 4101299,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 4101300,
        "end": 4299749,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 4299750,
        "end": 4432049,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 4564350,
        "end": 4696649,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 4432050,
        "end": 4564349,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 5093550,
        "end": 5291999,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 5556600,
        "end": 5755049,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 145860,
        "end": 152863,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 3439800,
        "end": 3572099,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 4299750,
        "end": 4432049,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 3836700,
        "end": 3968999,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 4432050,
        "end": 4564349,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 3969000,
        "end": 4101299,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 4564350,
        "end": 4696649,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 4101300,
        "end": 4299749,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 4696650,
        "end": 4828949,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 4828950,
        "end": 4961249,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 5093550,
        "end": 5291999,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 4961250,
        "end": 5093549,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 5556600,
        "end": 5755049,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 5093550,
        "end": 5291999,
        "label": "Crash"
      }
    }
  },
  {
    "id": "002",
    "name": "Standard 1 (Side Stick)",
    "category": "Standard",
    "fileName": "002 - Standard 1 (Side Stick).sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 145860,
        "end": 152863,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 3439800,
        "end": 3572099,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 3836700,
        "end": 3968999,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 3969000,
        "end": 4101299,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 4101300,
        "end": 4299749,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 4299750,
        "end": 4432049,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 4564350,
        "end": 4696649,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 4432050,
        "end": 4564349,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 5093550,
        "end": 5291999,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 5556600,
        "end": 5755049,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 145860,
        "end": 152863,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 3439800,
        "end": 3572099,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 4299750,
        "end": 4432049,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 3836700,
        "end": 3968999,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 4432050,
        "end": 4564349,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 3969000,
        "end": 4101299,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 4564350,
        "end": 4696649,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 4101300,
        "end": 4299749,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 4696650,
        "end": 4828949,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 4828950,
        "end": 4961249,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 5093550,
        "end": 5291999,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 3307500,
        "end": 3439799,
        "label": "Side"
      },
      "51": {
        "key": 51,
        "offset": 5556600,
        "end": 5755049,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 5093550,
        "end": 5291999,
        "label": "Crash"
      }
    }
  },
  {
    "id": "003",
    "name": "Standard 2",
    "category": "Standard",
    "fileName": "003 - Standard 2.sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 145860,
        "end": 152863,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 2647975,
        "end": 2665811,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 3836700,
        "end": 3968999,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 3969000,
        "end": 4101299,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 4101300,
        "end": 4299749,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 145860,
        "end": 152863,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 2647975,
        "end": 2665811,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 3836700,
        "end": 3968999,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 3969000,
        "end": 4101299,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 4101300,
        "end": 4299749,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 488627,
        "end": 537426,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 2468344,
        "end": 2506267,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 458042,
        "end": 488581,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      }
    }
  },
  {
    "id": "004",
    "name": "Standard 2 (Double Bass)",
    "category": "Standard",
    "fileName": "004 - Standard 2 (Double Bass).sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 145860,
        "end": 152863,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 2647975,
        "end": 2665811,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 4101300,
        "end": 4299749,
        "label": "Open"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 145860,
        "end": 152863,
        "label": "Kick"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 4101300,
        "end": 4299749,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 145860,
        "end": 152863,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 2647975,
        "end": 2665811,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 4101300,
        "end": 4299749,
        "label": "Open"
      },
      "43": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 145860,
        "end": 152863,
        "label": "Kick"
      },
      "45": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 4101300,
        "end": 4299749,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 488627,
        "end": 537426,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 2468344,
        "end": 2506267,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 458042,
        "end": 488581,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      }
    }
  },
  {
    "id": "005",
    "name": "Standard 2 (Loud Hihat)",
    "category": "Standard",
    "fileName": "005 - Standard 2 (Loud Hihat).sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 145860,
        "end": 152863,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 2647975,
        "end": 2665811,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 138980,
        "end": 145814,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 136024,
        "end": 138934,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 101181,
        "end": 135978,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 145860,
        "end": 152863,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 2647975,
        "end": 2665811,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 138980,
        "end": 145814,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 136024,
        "end": 138934,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 101181,
        "end": 135978,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 488627,
        "end": 537426,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 2468344,
        "end": 2506267,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 458042,
        "end": 488581,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      }
    }
  },
  {
    "id": "006",
    "name": "Standard 3",
    "category": "Standard",
    "fileName": "006 - Standard 3.sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 871558,
        "end": 888427,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 2608175,
        "end": 2622522,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 3836700,
        "end": 3968999,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 3969000,
        "end": 4101299,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 4101300,
        "end": 4299749,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 871558,
        "end": 888427,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 2608175,
        "end": 2622522,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 3836700,
        "end": 3968999,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 3969000,
        "end": 4101299,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 4101300,
        "end": 4299749,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 488627,
        "end": 537426,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 2468344,
        "end": 2506267,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 458042,
        "end": 488581,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      }
    }
  },
  {
    "id": "007",
    "name": "Standard 3 (Loud Hihat)",
    "category": "Standard",
    "fileName": "007 - Standard 3 (Loud Hihat).sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 871558,
        "end": 888427,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 2608175,
        "end": 2622522,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 138980,
        "end": 145814,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 136024,
        "end": 138934,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 101181,
        "end": 135978,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 871558,
        "end": 888427,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 2608175,
        "end": 2622522,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 138980,
        "end": 145814,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 136024,
        "end": 138934,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 101181,
        "end": 135978,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 488627,
        "end": 537426,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 2468344,
        "end": 2506267,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 458042,
        "end": 488581,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      }
    }
  },
  {
    "id": "008",
    "name": "Standard 4",
    "category": "Standard",
    "fileName": "008 - Standard 4.sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 2910600,
        "end": 2932649,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 2932650,
        "end": 2954699,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 3836700,
        "end": 3968999,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 3969000,
        "end": 4101299,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 4101300,
        "end": 4299749,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 2910600,
        "end": 2932649,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 2932650,
        "end": 2954699,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 3836700,
        "end": 3968999,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 3969000,
        "end": 4101299,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 4101300,
        "end": 4299749,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 488627,
        "end": 537426,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 2468344,
        "end": 2506267,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 458042,
        "end": 488581,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      }
    }
  },
  {
    "id": "009",
    "name": "Standard 4 (Loud Hihat)",
    "category": "Standard",
    "fileName": "009 - Standard 4 (Loud Hihat).sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 2910600,
        "end": 2932649,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 2932650,
        "end": 2954699,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 138980,
        "end": 145814,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 136024,
        "end": 138934,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 101181,
        "end": 135978,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 2910600,
        "end": 2932649,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 2932650,
        "end": 2954699,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 138980,
        "end": 145814,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 136024,
        "end": 138934,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 101181,
        "end": 135978,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 488627,
        "end": 537426,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 2468344,
        "end": 2506267,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 458042,
        "end": 488581,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      }
    }
  },
  {
    "id": "010",
    "name": "Standard 5",
    "category": "Standard",
    "fileName": "010 - Standard 5.sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 2910600,
        "end": 2932649,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 2932650,
        "end": 2954699,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 2954700,
        "end": 2965724,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 2965725,
        "end": 2976749,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 2976750,
        "end": 2998799,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 1731530,
        "end": 1822204,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 2910600,
        "end": 2932649,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 2932650,
        "end": 2954699,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 2954700,
        "end": 2965724,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 2965725,
        "end": 2976749,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 2976750,
        "end": 2998799,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 488627,
        "end": 537426,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 2468344,
        "end": 2506267,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 458042,
        "end": 488581,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 1731530,
        "end": 1822204,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      }
    }
  },
  {
    "id": "011",
    "name": "Standard 6",
    "category": "Standard",
    "fileName": "011 - Standard 6.sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 2910600,
        "end": 2932649,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 2932650,
        "end": 2954699,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 2954700,
        "end": 2965724,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 2965725,
        "end": 2976749,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 2976750,
        "end": 2998799,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 4299750,
        "end": 4432049,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 4564350,
        "end": 4696649,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 4432050,
        "end": 4564349,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 1731530,
        "end": 1822204,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 2910600,
        "end": 2932649,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 2932650,
        "end": 2954699,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 4299750,
        "end": 4432049,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 2954700,
        "end": 2965724,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 4432050,
        "end": 4564349,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 2965725,
        "end": 2976749,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 4564350,
        "end": 4696649,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 2976750,
        "end": 2998799,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 4696650,
        "end": 4828949,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 4828950,
        "end": 4961249,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 4961250,
        "end": 5093549,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 1731530,
        "end": 1822204,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      }
    }
  },
  {
    "id": "101",
    "name": "Room 1",
    "category": "Room",
    "fileName": "101 - Room 1.sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 445698,
        "end": 457996,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 1203326,
        "end": 1224837,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 138980,
        "end": 145814,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 136024,
        "end": 138934,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 101181,
        "end": 135978,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 1165187,
        "end": 1203280,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 1133468,
        "end": 1165141,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 60660,
        "end": 90493,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 445698,
        "end": 457996,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 1203326,
        "end": 1224837,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 1165187,
        "end": 1203280,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 138980,
        "end": 145814,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 60660,
        "end": 90493,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 136024,
        "end": 138934,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 1133468,
        "end": 1165141,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 101181,
        "end": 135978,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 30864,
        "end": 60614,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 1109362,
        "end": 1133422,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 10585,
        "end": 30818,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      }
    }
  },
  {
    "id": "102",
    "name": "Room 2",
    "category": "Room",
    "fileName": "102 - Room 2.sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 90539,
        "end": 101135,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 1224883,
        "end": 1246949,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 138980,
        "end": 145814,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 136024,
        "end": 138934,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 101181,
        "end": 135978,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 1165187,
        "end": 1203280,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 1133468,
        "end": 1165141,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 60660,
        "end": 90493,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 90539,
        "end": 101135,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 1224883,
        "end": 1246949,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 1165187,
        "end": 1203280,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 138980,
        "end": 145814,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 60660,
        "end": 90493,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 136024,
        "end": 138934,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 1133468,
        "end": 1165141,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 101181,
        "end": 135978,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 30864,
        "end": 60614,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 1109362,
        "end": 1133422,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 10585,
        "end": 30818,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      }
    }
  },
  {
    "id": "201",
    "name": "Rock 1",
    "category": "Rock",
    "fileName": "201 - Rock 1.sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 6615000,
        "end": 6747299,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 6879600,
        "end": 7011899,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 7541100,
        "end": 7640324,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 7640325,
        "end": 7739549,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 7739550,
        "end": 7871849,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 7871850,
        "end": 8004149,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 8136450,
        "end": 8268749,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 8004150,
        "end": 8136449,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 8665650,
        "end": 8831024,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 9095625,
        "end": 9294074,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 6615000,
        "end": 6747299,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 6879600,
        "end": 7011899,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 7871850,
        "end": 8004149,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 7541100,
        "end": 7640324,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 8004150,
        "end": 8136449,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 7640325,
        "end": 7739549,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 8136450,
        "end": 8268749,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 7739550,
        "end": 7871849,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 8268750,
        "end": 8401049,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 8401050,
        "end": 8533349,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 8665650,
        "end": 8831024,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 8533350,
        "end": 8665649,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 9095625,
        "end": 9294074,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 8665650,
        "end": 8831024,
        "label": "Crash"
      }
    }
  },
  {
    "id": "202",
    "name": "Rock 2",
    "category": "Rock",
    "fileName": "202 - Rock 2.sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 2910600,
        "end": 2932649,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 2932650,
        "end": 2954699,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 138980,
        "end": 145814,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 136024,
        "end": 138934,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 101181,
        "end": 135978,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 1731530,
        "end": 1822204,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 2910600,
        "end": 2932649,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 2932650,
        "end": 2954699,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 138980,
        "end": 145814,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 136024,
        "end": 138934,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 101181,
        "end": 135978,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 488627,
        "end": 537426,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 2468344,
        "end": 2506267,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 458042,
        "end": 488581,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 1731530,
        "end": 1822204,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      }
    }
  },
  {
    "id": "203",
    "name": "Power 1",
    "category": "Rock",
    "fileName": "203 - Power 1.sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 433065,
        "end": 445652,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 414253,
        "end": 433019,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 138980,
        "end": 145814,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 136024,
        "end": 138934,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 101181,
        "end": 135978,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 433065,
        "end": 445652,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 414253,
        "end": 433019,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 138980,
        "end": 145814,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 136024,
        "end": 138934,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 101181,
        "end": 135978,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 488627,
        "end": 537426,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 2468344,
        "end": 2506267,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 458042,
        "end": 488581,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      }
    }
  },
  {
    "id": "204",
    "name": "Power 2",
    "category": "Rock",
    "fileName": "204 - Power 2.sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 433065,
        "end": 445652,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 1203326,
        "end": 1224837,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 138980,
        "end": 145814,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 136024,
        "end": 138934,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 101181,
        "end": 135978,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 433065,
        "end": 445652,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 1203326,
        "end": 1224837,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 138980,
        "end": 145814,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 136024,
        "end": 138934,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 101181,
        "end": 135978,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 488627,
        "end": 537426,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 2468344,
        "end": 2506267,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 458042,
        "end": 488581,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 2347667,
        "end": 2468298,
        "label": "Crash"
      }
    }
  },
  {
    "id": "205",
    "name": "Rock 1 (Double Bass)",
    "category": "Rock",
    "fileName": "205 - Rock 1 (Double Bass).sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 6615000,
        "end": 6747299,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 6879600,
        "end": 7011899,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 7739550,
        "end": 7871849,
        "label": "Open"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 6615000,
        "end": 6747299,
        "label": "Kick"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 7739550,
        "end": 7871849,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 7871850,
        "end": 8004149,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 8136450,
        "end": 8268749,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 8004150,
        "end": 8136449,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 8665650,
        "end": 8831024,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 9095625,
        "end": 9294074,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 6615000,
        "end": 6747299,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 6879600,
        "end": 7011899,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 7871850,
        "end": 8004149,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 7739550,
        "end": 7871849,
        "label": "Open"
      },
      "43": {
        "key": 43,
        "offset": 8004150,
        "end": 8136449,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 6615000,
        "end": 6747299,
        "label": "Kick"
      },
      "45": {
        "key": 45,
        "offset": 8136450,
        "end": 8268749,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 7739550,
        "end": 7871849,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 8268750,
        "end": 8401049,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 8401050,
        "end": 8533349,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 8665650,
        "end": 8831024,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 8533350,
        "end": 8665649,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 9095625,
        "end": 9294074,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 8665650,
        "end": 8831024,
        "label": "Crash"
      }
    }
  },
  {
    "id": "301",
    "name": "Jazz 1",
    "category": "Jazz",
    "fileName": "301 - Jazz 1.sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 10187100,
        "end": 10319399,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 10451700,
        "end": 10583999,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 10848600,
        "end": 10947824,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 10947825,
        "end": 11080124,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 11080125,
        "end": 11245499,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 11245500,
        "end": 11377799,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 11510100,
        "end": 11642399,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 11377800,
        "end": 11510099,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 12039300,
        "end": 12270824,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 12436200,
        "end": 12568499,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 10187100,
        "end": 10319399,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 10451700,
        "end": 10583999,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 11245500,
        "end": 11377799,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 10848600,
        "end": 10947824,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 11377800,
        "end": 11510099,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 10947825,
        "end": 11080124,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 11510100,
        "end": 11642399,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 11080125,
        "end": 11245499,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 11642400,
        "end": 11774699,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 11774700,
        "end": 11906999,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 12039300,
        "end": 12270824,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 11907000,
        "end": 12039299,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 12436200,
        "end": 12568499,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 12039300,
        "end": 12270824,
        "label": "Crash"
      }
    }
  },
  {
    "id": "302",
    "name": "Jazz 2",
    "category": "Jazz",
    "fileName": "302 - Jazz 2.sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 859137,
        "end": 866417,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 603626,
        "end": 624378,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 138980,
        "end": 145814,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 136024,
        "end": 138934,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 101181,
        "end": 135978,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 1889145,
        "end": 1998593,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 859137,
        "end": 866417,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 603626,
        "end": 624378,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 138980,
        "end": 145814,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 136024,
        "end": 138934,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 101181,
        "end": 135978,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 488627,
        "end": 537426,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 2468344,
        "end": 2506267,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 1889145,
        "end": 1998593,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 458042,
        "end": 488581,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 1889145,
        "end": 1998593,
        "label": "Crash"
      }
    }
  },
  {
    "id": "303",
    "name": "Brush 1",
    "category": "Brush",
    "fileName": "303 - Brush 1.sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 13097700,
        "end": 13229999,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 849539,
        "end": 859091,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 13626900,
        "end": 13726124,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 13726125,
        "end": 13825349,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 13825350,
        "end": 14023799,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 14023800,
        "end": 14156099,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 14288400,
        "end": 14420699,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 14156100,
        "end": 14288399,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 14817600,
        "end": 15016049,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 15181425,
        "end": 15346799,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 13097700,
        "end": 13229999,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 849539,
        "end": 859091,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 14023800,
        "end": 14156099,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 13626900,
        "end": 13726124,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 14156100,
        "end": 14288399,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 13726125,
        "end": 13825349,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 14288400,
        "end": 14420699,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 13825350,
        "end": 14023799,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 14420700,
        "end": 14552999,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 14553000,
        "end": 14685299,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 14817600,
        "end": 15016049,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 14685300,
        "end": 14817599,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 15181425,
        "end": 15346799,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 14817600,
        "end": 15016049,
        "label": "Crash"
      }
    }
  },
  {
    "id": "401",
    "name": "Electronic 1",
    "category": "Electronic",
    "fileName": "401 - Electronic 1.sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 167160,
        "end": 179931,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 194452,
        "end": 200085,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 2954700,
        "end": 2965724,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 2965725,
        "end": 2976749,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 2976750,
        "end": 2998799,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 1889145,
        "end": 1998593,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 167160,
        "end": 179931,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 194452,
        "end": 200085,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 2559531,
        "end": 2608129,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 2954700,
        "end": 2965724,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 537472,
        "end": 585993,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 2965725,
        "end": 2976749,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 2506313,
        "end": 2557191,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 2976750,
        "end": 2998799,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 488627,
        "end": 537426,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 2468344,
        "end": 2506267,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 1889145,
        "end": 1998593,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 458042,
        "end": 488581,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 1889145,
        "end": 1998593,
        "label": "Crash"
      }
    }
  },
  {
    "id": "402",
    "name": "TR808",
    "category": "Electronic",
    "fileName": "402 - TR808.sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 1035351,
        "end": 1051141,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 1027987,
        "end": 1035305,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 992881,
        "end": 997136,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 978692,
        "end": 981279,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 939968,
        "end": 967496,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 997182,
        "end": 1009632,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 967542,
        "end": 978646,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 981325,
        "end": 992835,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 1889145,
        "end": 1998593,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 1035351,
        "end": 1051141,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 1027987,
        "end": 1035305,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 997182,
        "end": 1009632,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 992881,
        "end": 997136,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 981325,
        "end": 992835,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 978692,
        "end": 981279,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 967542,
        "end": 978646,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 939968,
        "end": 967496,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 929612,
        "end": 939922,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 919829,
        "end": 929566,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 1889145,
        "end": 1998593,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 911368,
        "end": 919783,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 1889145,
        "end": 1998593,
        "label": "Crash"
      }
    }
  },
  {
    "id": "403",
    "name": "TR808 -2",
    "category": "Electronic",
    "fileName": "403 - TR808 -2.sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 1051187,
        "end": 1070707,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 1009678,
        "end": 1027941,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 992881,
        "end": 997136,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 978692,
        "end": 981279,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 939968,
        "end": 967496,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 997182,
        "end": 1009632,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 967542,
        "end": 978646,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 981325,
        "end": 992835,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 1889145,
        "end": 1998593,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 1051187,
        "end": 1070707,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 1009678,
        "end": 1027941,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 997182,
        "end": 1009632,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 992881,
        "end": 997136,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 981325,
        "end": 992835,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 978692,
        "end": 981279,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 967542,
        "end": 978646,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 939968,
        "end": 967496,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 929612,
        "end": 939922,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 919829,
        "end": 929566,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 1889145,
        "end": 1998593,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 911368,
        "end": 919783,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 1889145,
        "end": 1998593,
        "label": "Crash"
      }
    }
  },
  {
    "id": "404",
    "name": "TR909",
    "category": "Electronic",
    "fileName": "404 - TR909.sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 0,
        "end": 10539,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 1092472,
        "end": 1109316,
        "label": "Snare"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 2954700,
        "end": 2965724,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 2965725,
        "end": 2976749,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 2976750,
        "end": 2998799,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 745761,
        "end": 778334,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 690399,
        "end": 717258,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 717304,
        "end": 745715,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 14817600,
        "end": 15016049,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 15181425,
        "end": 15346799,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 0,
        "end": 10539,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 1092472,
        "end": 1109316,
        "label": "Snare"
      },
      "41": {
        "key": 41,
        "offset": 745761,
        "end": 778334,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 2954700,
        "end": 2965724,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 717304,
        "end": 745715,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 2965725,
        "end": 2976749,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 690399,
        "end": 717258,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 2976750,
        "end": 2998799,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 667060,
        "end": 690353,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 645804,
        "end": 667014,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 14817600,
        "end": 15016049,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 624424,
        "end": 645758,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 15181425,
        "end": 15346799,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 14817600,
        "end": 15016049,
        "label": "Crash"
      }
    }
  },
  {
    "id": "405",
    "name": "TR909 (Hand Clap)",
    "category": "Electronic",
    "fileName": "405 - TR909 (Hand Clap).sfz",
    "sounds": {
      "kick": {
        "key": 36,
        "offset": 0,
        "end": 10539,
        "label": "Kick"
      },
      "snare": {
        "key": 38,
        "offset": 2622568,
        "end": 2647929,
        "label": "Hand"
      },
      "hiHatClosed": {
        "key": 42,
        "offset": 2954700,
        "end": 2965724,
        "label": "Closed"
      },
      "hiHatPedal": {
        "key": 44,
        "offset": 2965725,
        "end": 2976749,
        "label": "Pedal"
      },
      "hiHatOpen": {
        "key": 46,
        "offset": 2976750,
        "end": 2998799,
        "label": "Open"
      },
      "tom1": {
        "key": 41,
        "offset": 745761,
        "end": 778334,
        "label": "Low"
      },
      "tom2": {
        "key": 45,
        "offset": 690399,
        "end": 717258,
        "label": "Mid"
      },
      "floorTom": {
        "key": 43,
        "offset": 717304,
        "end": 745715,
        "label": "Low"
      },
      "crash": {
        "key": 49,
        "offset": 1889145,
        "end": 1998593,
        "label": "Crash"
      },
      "ride": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      }
    },
    "regions": {
      "36": {
        "key": 36,
        "offset": 0,
        "end": 10539,
        "label": "Kick"
      },
      "38": {
        "key": 38,
        "offset": 2622568,
        "end": 2647929,
        "label": "Hand"
      },
      "41": {
        "key": 41,
        "offset": 745761,
        "end": 778334,
        "label": "Low"
      },
      "42": {
        "key": 42,
        "offset": 2954700,
        "end": 2965724,
        "label": "Closed"
      },
      "43": {
        "key": 43,
        "offset": 717304,
        "end": 745715,
        "label": "Low"
      },
      "44": {
        "key": 44,
        "offset": 2965725,
        "end": 2976749,
        "label": "Pedal"
      },
      "45": {
        "key": 45,
        "offset": 690399,
        "end": 717258,
        "label": "Mid"
      },
      "46": {
        "key": 46,
        "offset": 2976750,
        "end": 2998799,
        "label": "Open"
      },
      "47": {
        "key": 47,
        "offset": 667060,
        "end": 690353,
        "label": "Mid"
      },
      "48": {
        "key": 48,
        "offset": 645804,
        "end": 667014,
        "label": "High"
      },
      "49": {
        "key": 49,
        "offset": 1889145,
        "end": 1998593,
        "label": "Crash"
      },
      "50": {
        "key": 50,
        "offset": 624424,
        "end": 645758,
        "label": "High"
      },
      "51": {
        "key": 51,
        "offset": 2253703,
        "end": 2347621,
        "label": "Ride"
      },
      "57": {
        "key": 57,
        "offset": 1889145,
        "end": 1998593,
        "label": "Crash"
      }
    }
  }
];

export const DRUM_KITS_MAP: Record<string, DrumKitPreset> = DRUM_KITS.reduce((acc, kit) => {
  acc[kit.id] = kit;
  return acc;
}, {} as Record<string, DrumKitPreset>);

export const DEFAULT_DRUM_KIT_ID = "001";

export const DRUM_KIT_CATEGORIES = ["All", "Standard", "Room", "Rock", "Jazz", "Brush", "Electronic"] as const;
export type DrumKitCategory = typeof DRUM_KIT_CATEGORIES[number];
