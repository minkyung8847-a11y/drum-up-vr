import { useState, useEffect, useRef, useCallback } from "react";
import type { DrumPadId, MidiMap } from "../types";

export interface MidiEventInfo {
  device: string;
  rawArray: string;
  statusByte: string;
  channel: number;
  type: string;
  note: number;
  velocity: number;
  time: string; // HH:MM:SS.mmm
}

export type MidiConnectionState =
  | "disconnected"
  | "scanning"
  | "selection"
  | "connecting"
  | "connected"
  | "lost"
  | "error";

// Default HOSIMI note map from settingsStore.js
const DEFAULT_MIDI_MAP: MidiMap = {
  36: "kick",         // Bass Drum 1
  35: "kick",         // Acoustic Bass Drum
  38: "snare",        // Acoustic Snare
  40: "snare",        // Electric Snare
  42: "hihat-closed", // Closed Hi-Hat
  44: "hihat-pedal",  // Pedal Hi-Hat
  46: "hihat-open",   // Open Hi-Hat
  41: "tom-high",     // Hoshimi smallTom
  47: "tom-high",     // Hoshimi smallTom
  45: "tom-mid",      // Hoshimi middleTom
  43: "tom-floor",    // Hoshimi floorTom
  48: "tom-floor",    // Hoshimi floorTom
  49: "crash",        // Crash Cymbal 1
  57: "crash",        // Crash Cymbal 2
  51: "ride",         // Ride Cymbal 1
  59: "ride",         // Ride Cymbal 2
};

export const useMidi = (
  onPadHit: (padId: DrumPadId, velocity: number, note: number) => void
) => {
  const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null);
  const [inputs, setInputs] = useState<MIDIInput[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>("");
  const [connectionState, setConnectionState] = useState<MidiConnectionState>("disconnected");
  const [lastMidiEvent, setLastMidiEvent] = useState<MidiEventInfo | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [signalActive, setSignalActive] = useState<boolean>(false);
  
  const [midiMap, setMidiMap] = useState<MidiMap>(() => {
    const saved = localStorage.getItem("drumup_midi_map");
    const VALID_PAD_IDS = new Set([
      "kick",
      "snare",
      "hihat-closed",
      "hihat-open",
      "hihat-pedal",
      "tom-high",
      "tom-mid",
      "tom-floor",
      "crash",
      "ride"
    ]);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const sanitized: MidiMap = {};
        Object.keys(parsed).forEach(key => {
          const note = Number(key);
          const val = parsed[key];
          if (!isNaN(note) && VALID_PAD_IDS.has(val)) {
            sanitized[note] = val;
          }
        });
        // Ensure default note mappings are present as fallback
        return { ...DEFAULT_MIDI_MAP, ...sanitized };
      } catch (e) {
        console.error("Failed to parse saved MIDI map:", e);
      }
    }
    return DEFAULT_MIDI_MAP;
  });

  const [learningPadId, setLearningPadId] = useState<DrumPadId | null>(null);

  const midiMapRef = useRef(midiMap);
  useEffect(() => {
    midiMapRef.current = midiMap;
  }, [midiMap]);

  const learningPadIdRef = useRef(learningPadId);
  useEffect(() => {
    learningPadIdRef.current = learningPadId;
  }, [learningPadId]);

  const onPadHitRef = useRef(onPadHit);
  useEffect(() => {
    onPadHitRef.current = onPadHit;
  }, [onPadHit]);

  const activeDeviceRef = useRef<MIDIInput | null>(null);
  const signalTimerRef = useRef<any>(null);

  // Return formatted timestamp HH:MM:SS.mmm
  const getTimestamp = () => {
    const now = new Date();
    const h = now.getHours().toString().padStart(2, "0");
    const m = now.getMinutes().toString().padStart(2, "0");
    const s = now.getSeconds().toString().padStart(2, "0");
    const ms = now.getMilliseconds().toString().padStart(3, "0");
    return `${h}:${m}:${s}.${ms}`;
  };

  const handleMidiMessage = useCallback((event: Event) => {
    const midiEvent = event as MIDIMessageEvent;
    if (!midiEvent.data) return;

    const [status, note, velocity] = midiEvent.data;
    const command = status & 0xf0;
    const channel = (status & 0x0f) + 1;

    const inputDevice = event.target as MIDIInput;
    const deviceName = inputDevice?.name || activeDeviceRef.current?.name || "Unknown Device";
    
    const isNoteOn = command === 0x90 && velocity > 0;
    const isNoteOff = command === 0x80 || (command === 0x90 && velocity === 0);
    const typeStr = isNoteOn ? "Note On" : isNoteOff ? "Note Off" : "Unknown";

    const statusByteHex = `0x${status.toString(16).toUpperCase().padStart(2, "0")}`;
    const rawArrayStr = `[${Array.from(midiEvent.data).join(", ")}]`;

    // Console print details
    console.log(`MIDI 수신 - Type: ${typeStr}, Channel: ${channel}, Note: ${note}, Velocity: ${velocity}, Data: ${rawArrayStr}`);

    // Log event info
    setLastMidiEvent({
      device: deviceName,
      rawArray: rawArrayStr,
      statusByte: statusByteHex,
      channel,
      type: typeStr,
      note,
      velocity,
      time: getTimestamp()
    });

    if (isNoteOn) {
      setSignalActive(true);
      if (signalTimerRef.current) {
        clearTimeout(signalTimerRef.current);
      }
      signalTimerRef.current = setTimeout(() => {
        setSignalActive(false);
      }, 600);

      // Custom MIDI learning/mapping logic
      const currentLearningPad = learningPadIdRef.current;
      if (currentLearningPad) {
        setMidiMap(prev => {
          const next = { ...prev };
          // Remove this note mapping from any other pad to prevent duplicate mapping
          Object.keys(next).forEach(k => {
            const noteNum = Number(k);
            if (next[noteNum] === currentLearningPad) {
              delete next[noteNum];
            }
          });
          next[note] = currentLearningPad;
          localStorage.setItem("drumup_midi_map", JSON.stringify(next));
          return next;
        });
        setLearningPadId(null); // Turn off learning state
        return; // Skip hit sound/animation trigger during learning strike
      }

      const padId = midiMapRef.current[note];
      if (padId) {
        onPadHitRef.current(padId, velocity, note);
      }
    }
  }, []);

  // Update inputs list and self-heal connection states dynamically
  const updateInputs = useCallback((access: MIDIAccess) => {
    const list = Array.from(access.inputs.values());
    setInputs(list);
    console.log("MIDI Devices List Updated:", list.map(i => `${i.name} (state: ${i.state}, connection: ${i.connection})`));

    // Print device details to console
    list.forEach(input => {
      console.log(`MIDI INPUT FOUND\nname: ${input.name || "Unknown"}\nmanufacturer: ${input.manufacturer || "Unknown"}\nid: ${input.id}\nstate: ${input.state}\nconnection: ${input.connection}`);
    });

    setConnectionState(prev => {
      if (list.length === 0) {
        if (prev === "connected" || prev === "connecting" || prev === "selection") {
          return "lost";
        }
        return "disconnected";
      } else {
        if (prev === "disconnected" || prev === "lost" || prev === "error") {
          return "selection";
        }
        return prev;
      }
    });

    // Auto-detect unplugged active device
    if (activeDeviceRef.current) {
      const activeStillExists = list.some((i) => i.id === activeDeviceRef.current?.id);
      if (!activeStillExists) {
        activeDeviceRef.current = null;
        setSelectedInputId("");
      }
    }
  }, []);

  // Connect to the selected device with explicit open() and dual listeners
  const connectDevice = useCallback(async (id: string) => {
    if (!midiAccess) return;
    setConnectionState("connecting");

    // Unbind previous listener on active device
    if (activeDeviceRef.current) {
      activeDeviceRef.current.onmidimessage = null;
      activeDeviceRef.current.removeEventListener("midimessage", handleMidiMessage);
    }
    // Unbind temporary test listeners on all other devices
    Array.from(midiAccess.inputs.values()).forEach(input => {
      input.onmidimessage = null;
      input.removeEventListener("midimessage", handleMidiMessage);
    });

    const input = Array.from(midiAccess.inputs.values()).find((i) => i.id === id);
    if (!input) {
      setConnectionState("error");
      setPermissionError("선택한 장치를 찾을 수 없습니다.");
      return;
    }

    try {
      // Explicitly open the input port
      console.log(`Attempting to open port for: ${input.name} (Current connection state: ${input.connection})`);
      await input.open();
      
      if (input.connection !== "open") {
        throw new Error(`포트가 개방 상태(open)로 전환되지 않았습니다. 현재 상태: ${input.connection}`);
      }

      // Bind listener using dual methods for compatibility
      input.onmidimessage = handleMidiMessage;
      input.addEventListener("midimessage", handleMidiMessage);

      activeDeviceRef.current = input;
      setSelectedInputId(id);
      setConnectionState("connected");
      console.log(`MIDI PORT EXPLICITLY OPENED AND BOUND: ${input.name}`);
    } catch (e: any) {
      console.error("Failed to open MIDI port:", e);
      setConnectionState("error");
      setPermissionError(`장치 연결에 실패했습니다: ${e.message || "오류"}`);
    }
  }, [midiAccess, handleMidiMessage]);

  // Disconnect the active device
  const disconnectDevice = useCallback(() => {
    if (activeDeviceRef.current) {
      activeDeviceRef.current.onmidimessage = null;
      activeDeviceRef.current.removeEventListener("midimessage", handleMidiMessage);
      activeDeviceRef.current = null;
    }
    if (midiAccess) {
      Array.from(midiAccess.inputs.values()).forEach(input => {
        input.onmidimessage = null;
        input.removeEventListener("midimessage", handleMidiMessage);
      });
    }
    setConnectionState("disconnected");
    setSelectedInputId("");
  }, [midiAccess, handleMidiMessage]);

  // Scan devices triggered by user interaction
  const scanDevices = useCallback(async () => {
    if (!navigator.requestMIDIAccess) {
      setConnectionState("error");
      setPermissionError("현재 브라우저에서 Web MIDI API를 호출할 수 없거나, 보안되지 않은 컨텍스트(HTTPS 또는 localhost가 아님)입니다. 브라우저 보안 환경을 점검해 주세요.");
      return;
    }

    setConnectionState("scanning");
    setPermissionError(null);

    try {
      // Simulated scan delay
      await new Promise(resolve => setTimeout(resolve, 600));

      const access = await navigator.requestMIDIAccess({ sysex: false });
      setMidiAccess(access);

      const list = Array.from(access.inputs.values());
      setInputs(list);
      
      // Auto-detect on statechange using addEventListener
      access.addEventListener("statechange", () => {
        updateInputs(access);
      });

      // Print initial device list details to console
      list.forEach(input => {
        console.log(`MIDI INPUT FOUND\nname: ${input.name || "Unknown"}\nmanufacturer: ${input.manufacturer || "Unknown"}\nid: ${input.id}\nstate: ${input.state}\nconnection: ${input.connection}`);
      });

      if (list.length === 0) {
        setConnectionState("disconnected");
        setPermissionError("사용 가능한 MIDI 장치를 찾을 수 없습니다. 전자드럼의 MIDI 연결 상태와 노트북의 장치 인식을 확인해주세요.");
      } else {
        setConnectionState("selection");

        // REQUIREMENT 6: Explicitly call open() and bind message listener to ALL inputs for testing
        for (const input of list) {
          try {
            await input.open();
            input.onmidimessage = handleMidiMessage;
            input.addEventListener("midimessage", handleMidiMessage);
            console.log(`MIDI INPUT TEST BOUND: ${input.name} (id: ${input.id})`);
          } catch (e) {
            console.warn(`Failed to open input ${input.name} for temporary binding:`, e);
          }
        }

        const hosimi = list.find(input => (input.name || "").toUpperCase().includes("HOSIMI"));
        setSelectedInputId(hosimi ? hosimi.id : list[0].id);
      }
    } catch (err: any) {
      setConnectionState("error");
      const errName = err.name || "AccessError";
      const errMsg = err.message || "접근 권한 에러";
      setPermissionError(`MIDI 접근 권한 오류 (${errName}): ${errMsg}. 브라우저 주소창 왼쪽 자물쇠 아이콘을 클릭하여 권한을 허용해 주세요.`);
    }
  }, [handleMidiMessage, updateInputs]);

  // Reset mappings to defaults
  const resetToDefaultMapping = useCallback(() => {
    setMidiMap(DEFAULT_MIDI_MAP);
    localStorage.setItem("drumup_midi_map", JSON.stringify(DEFAULT_MIDI_MAP));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeDeviceRef.current) {
        activeDeviceRef.current.onmidimessage = null;
        activeDeviceRef.current.removeEventListener("midimessage", handleMidiMessage);
      }
      if (signalTimerRef.current) {
        clearTimeout(signalTimerRef.current);
      }
    };
  }, [handleMidiMessage]);

  return {
    connectionState,
    inputs,
    selectedInputId,
    setSelectedInputId,
    lastMidiEvent,
    midiMap,
    permissionError,
    scanDevices,
    connectDevice,
    disconnectDevice,
    resetToDefaultMapping,
    signalActive,
    learningPadId,
    startLearning: (padId: DrumPadId) => setLearningPadId(padId),
    stopLearning: () => setLearningPadId(null),
  };
};
