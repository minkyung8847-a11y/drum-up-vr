import { BrandLogo } from "./components/brand/BrandLogo";
import { useState, useEffect, useCallback, useRef } from "react";
import { Drum3D } from "./components/Drum3D";
import type { Drum3DHandle } from "./components/Drum3D";
import { useMidi } from "./hooks/useMidi";
import { drumSynth } from "./utils/synth";
import { Menu, Settings, Bluetooth } from "lucide-react";
import { RudimentPractice } from "./components/RudimentPractice";
import { SongPractice } from "./components/SongPractice";
import type { GameScore, SongChart } from "./types";
import { MidiSettingsModal } from "./components/MidiSettingsModal";
import { DrumKitSelector } from "./components/DrumKitSelector";
import { BeatIndicator, type TimeSignature } from "./components/BeatIndicator";
import { DrumKitShowroom } from "./components/showroom/DrumKitShowroom";

type ActiveTab = "FREE PLAY" | "RUDIMENT" | "RHYTHM GAME";
type AppView = "SHOWROOM" | "PLAY";
type DrumPadId = "kick" | "snare" | "hihat" | "tom1" | "tom2" | "tom3" | "crash" | "ride";
type RudimentDifficulty = "EASY" | "NORMAL" | "HARD";

function App() {
  const drumRef = useRef<Drum3DHandle | null>(null);
  const [appView, setAppView] = useState<AppView>("SHOWROOM");
  const [activeTab, setActiveTab] = useState<ActiveTab>("FREE PLAY");
  const [selectedKitId, setSelectedKitId] = useState<string>(() => drumSynth.getCurrentKitId());

  useEffect(() => {
    return drumSynth.onKitChange((kitId) => {
      setSelectedKitId(kitId);
    });
  }, []);

  const handleSelectKit = useCallback((kitId: string) => {
    drumSynth.setKit(kitId);
    setSelectedKitId(kitId);
  }, []);

  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [selectedRudimentDifficulty, setSelectedRudimentDifficulty] = useState<RudimentDifficulty | null>(null);
  const [rudimentIsPlaying, setRudimentIsPlaying] = useState<boolean>(false);
  const [songIsPlaying, setSongIsPlaying] = useState<boolean>(false);
  const [currentSong, setCurrentSong] = useState<SongChart | null>(null);
  const [lastHitEvent, setLastHitEvent] = useState<{ padId: DrumPadId; time: number } | null>(null);
  const [rudimentScore, setRudimentScore] = useState<GameScore>({
    score: 0,
    combo: 0,
    maxCombo: 0,
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0,
    accuracy: 0,
  });
  const [drumScreenPositions, setDrumScreenPositions] = useState<Record<DrumPadId, { x: number; y: number }> | null>(null);

  // Audio & Metronome settings
  const [bpm, setBpm] = useState<number>(60);
  const [volume, setVolume] = useState<number>(80);
  const [metronomeOn, setMetronomeOn] = useState<boolean>(false);
  const [timeSignature, setTimeSignature] = useState<TimeSignature>("4/4");
  const [currentBeat, setCurrentBeat] = useState<number>(-1);
  const [isMetronomeFlash, setIsMetronomeFlash] = useState<boolean>(false);



  const triggerHit = useCallback((id: DrumPadId) => {
    console.log(`[App] Trigger hit for: ${id}, drumRef.current is:`, drumRef.current);
    // 1. Play low latency sound
    const synthKey = id === "hihat" ? "hihat-closed" : id === "tom1" ? "tom-high" : id === "tom2" ? "tom-mid" : id === "tom3" ? "tom-floor" : id;
    drumSynth.trigger(synthKey, 1.0);

    // 2. Trigger 3D visual squash & wobble response
    if (drumRef.current) {
      drumRef.current.hitDrum(id);
    } else {
      console.warn(`[App] drumRef.current is null! Visual animation skipped.`);
    }
  }, []);

  // Web MIDI pad hit handler (mapping detailed midi IDs to 8 visual pad IDs)
  const handleMidiPadHit = useCallback((midiPadId: string, _velocity: number, _note: number) => {
    let mappedId: DrumPadId = "kick";
    
    if (midiPadId === "kick") mappedId = "kick";
    else if (midiPadId === "snare") mappedId = "snare";
    else if (midiPadId.startsWith("hihat")) mappedId = "hihat";
    else if (midiPadId === "tom-high") mappedId = "tom1";
    else if (midiPadId === "tom-mid") mappedId = "tom2";
    else if (midiPadId === "tom-floor") mappedId = "tom3";
    else if (midiPadId === "crash") mappedId = "crash";
    else if (midiPadId === "ride") mappedId = "ride";


    // Trigger low-latency audio synthesizer sound & 3D visual response
    triggerHit(mappedId);
    setLastHitEvent({ padId: mappedId, time: performance.now() });
  }, [triggerHit]);

  // Hook into MIDI Devices and Custom mapping configuration
  const {
    connectionState,
    inputs: midiInputs,
    midiMap,
    learningPadId,
    startLearning,
    stopLearning,
    resetToDefaultMapping,
  } = useMidi(handleMidiPadHit);

  // Global document click unlocker to bypass browser Web Audio policies
  useEffect(() => {
    const unlock = () => {
      drumSynth.init();
      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("click", unlock);
    window.addEventListener("touchstart", unlock);
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  // Handle direct 3D mouse click
  const handlePartClick = useCallback((partId: DrumPadId) => {
    drumSynth.init();
    triggerHit(partId);
    setLastHitEvent({ padId: partId, time: performance.now() });
  }, [triggerHit]);

  const resetRudimentSession = useCallback(() => {
    setRudimentScore({
      score: 0,
      combo: 0,
      maxCombo: 0,
      perfect: 0,
      great: 0,
      good: 0,
      miss: 0,
      accuracy: 0,
    });
  }, []);

  const handleTabChange = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
    if (tab === "RUDIMENT") {
      setSelectedRudimentDifficulty(null);
      setRudimentIsPlaying(false);
      resetRudimentSession();
    }
    if (tab !== "RHYTHM GAME") {
      setSongIsPlaying(false);
      setCurrentSong(null);
    }
  }, [resetRudimentSession]);

  const handleSelectRudimentDifficulty = useCallback((difficulty: RudimentDifficulty) => {
    drumSynth.init();
    resetRudimentSession();
    setSelectedRudimentDifficulty(difficulty);
    setRudimentIsPlaying(true);
  }, [resetRudimentSession]);

  // Metronome sound & visual beat synchronization hook
  useEffect(() => {
    if (!metronomeOn) {
      setCurrentBeat(-1);
      setIsMetronomeFlash(false);
      return;
    }

    const beats = timeSignature === "3/4" ? 3 : timeSignature === "6/8" ? 6 : 4;
    const intervalMs = (60 / bpm) * 1000;

    // Play first beat immediately on start
    drumSynth.playMetronomeClick(true);
    setCurrentBeat(0);
    setIsMetronomeFlash(true);
    const flashTimeout = setTimeout(() => setIsMetronomeFlash(false), 80);

    let step = 0;

    const interval = setInterval(() => {
      step = (step + 1) % beats;
      const isDownbeat = step === 0;
      drumSynth.playMetronomeClick(isDownbeat);
      setCurrentBeat(step);
      setIsMetronomeFlash(true);
      setTimeout(() => setIsMetronomeFlash(false), 80);
    }, intervalMs);

    return () => {
      clearInterval(interval);
      clearTimeout(flashTimeout);
    };
  }, [metronomeOn, bpm, timeSignature]);

  const beatsPerBar = timeSignature === "3/4" ? 3 : timeSignature === "6/8" ? 6 : 4;

  if (appView === "SHOWROOM") {
    return (
      <DrumKitShowroom
        initialKitId={selectedKitId}
        onEnterPlay={(kitId) => {
          handleSelectKit(kitId);
          setAppView("PLAY");
        }}
      />
    );
  }

  return (
    <div className={`app-container play-view-in ${activeTab === "FREE PLAY" ? "acoustic-studio" : ""}`} data-view={activeTab}>
      {/* HEADER SECTION */}
      <header className="app-header">
        <div className="header-left">
          <button className="menu-button" aria-label="드럼 키트 선택" onClick={() => setAppView("SHOWROOM")}>
            <Menu size={20} />
          </button>
          <h1
            className="logo brand-header"
            onClick={() => setAppView("SHOWROOM")}
            style={{ cursor: "pointer" }}
            title="Go to Drum Kit Showroom"
          >
            <BrandLogo />
          </h1>
        </div>

        {/* Tab Navigation Capsule */}
        <nav className="nav-tabs">
          <button
            type="button"
            className="tab-button"
            onClick={() => setAppView("SHOWROOM")}
            style={{ color: "var(--accent-color, #FF6D2D)", fontWeight: 700 }}
            title="Return to Drum Kit Selection Showroom"
          >
            ← DRUM KITS
          </button>
          {(["FREE PLAY", "RUDIMENT", "RHYTHM GAME"] as ActiveTab[]).map((tab) => (
            <button
              key={tab}
              className={`tab-button ${activeTab === tab ? "active" : ""}`}
              onClick={() => handleTabChange(tab)}
            >
              {tab === "FREE PLAY" ? "Free Play" : tab === "RUDIMENT" ? "Rudiment" : "Song Practice"}
            </button>
          ))}
        </nav>

        <div className="header-right">
          <button 
            className="icon-button" 
            title="설정"
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings size={20} />
          </button>
          <button
            className="icon-button"
            style={{ 
              color: 
                connectionState === "connected" 
                  ? "#FF6D2D" 
                  : connectionState === "lost" 
                  ? "#FF6D2D" 
                  : connectionState === "error" 
                  ? "#FF6D2D"
                  : (connectionState === "scanning" || connectionState === "connecting")
                  ? "#FF6D2D"
                  : "var(--text-secondary)" 
            }}
            title={
              connectionState === "connected" ? "MIDI 기기 연결됨" : 
              connectionState === "lost" ? "연결 해제됨" : 
              connectionState === "error" ? "오류 발생" : "연결 대기중"
            }
          >
            <Bluetooth size={20} />
          </button>
          <div
            className={`midi-status`}
            style={{
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: "bold",
              background: 
                connectionState === "connected"
                  ? "rgba(255, 109, 45, 0.1)"
                  : connectionState === "lost"
                  ? "rgba(255, 109, 45, 0.1)"
                  : connectionState === "error"
                  ? "rgba(255, 109, 45, 0.1)"
                  : (connectionState === "scanning" || connectionState === "connecting")
                  ? "rgba(255, 109, 45, 0.1)"
                  : "rgba(255, 255, 255, 0.04)",
              color: 
                connectionState === "connected"
                  ? "#FF6D2D"
                  : connectionState === "lost"
                  ? "#FF6D2D"
                  : connectionState === "error"
                  ? "#FF6D2D"
                  : (connectionState === "scanning" || connectionState === "connecting")
                  ? "#FF6D2D"
                  : "var(--text-tertiary)",
              border: 
                connectionState === "connected"
                  ? "1px solid rgba(255, 109, 45, 0.2)"
                  : connectionState === "lost"
                  ? "1px solid rgba(255, 109, 45, 0.2)"
                  : connectionState === "error"
                  ? "1px solid rgba(255, 109, 45, 0.2)"
                  : "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: "20px",
            }}
          >
            {connectionState === "connected" ? "HOSIMI ON" :
             connectionState === "scanning" ? "검색 중" :
             connectionState === "connecting" ? "연결 중" :
             connectionState === "lost" ? "연결 해제" :
             connectionState === "error" ? "오류" : "MIDI OFF"}
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER LAYOUT */}
      <main className="main-layout">
        {/* SIDEBAR LEFT */}
        {activeTab !== "RUDIMENT" && (
          <aside className="sidebar-left">
            {/* Card 1: Drum Kit Selector / Song Title */}
            {activeTab === "RHYTHM GAME" ? (
              <div className="glass-panel" style={{ padding: "16px" }}>
                <span className="control-label" style={{ fontSize: "11px", textTransform: "none", color: "var(--text-secondary)" }}>
                  현재 곡
                </span>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: "850", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {currentSong ? currentSong.title : "선택된 곡 없음"}
                </h2>
              </div>
            ) : (
              <DrumKitSelector
                currentKitId={selectedKitId}
                onSelectKit={handleSelectKit}
                onOpenShowroom={() => setAppView("SHOWROOM")}
              />
            )}

            {/* Card 2: Tempo & Metronome (Unified) */}
            <div className="glass-panel tempo-metronome-card" style={{ padding: "16px" }}>
              {/* Header: Title & Metronome Switch */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div className={`metronome-visual ${isMetronomeFlash ? "flash" : ""}`} style={{ width: "7px", height: "7px" }} />
                  <span className="control-label" style={{ fontSize: "11px", margin: 0 }}>TEMPO / METRONOME</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, color: metronomeOn ? "#FF6D2D" : "rgba(255,255,255,0.4)" }}>
                    {metronomeOn ? "ON" : "OFF"}
                  </span>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={metronomeOn}
                      onChange={(e) => {
                        drumSynth.init();
                        setMetronomeOn(e.target.checked);
                      }}
                    />
                    <span className="switch-slider" />
                  </label>
                </div>
              </div>

              {/* BPM Display & Steppers */}
              <div className="bpm-display" style={{ marginTop: "4px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                  <span className="bpm-number" style={{ fontSize: "32px" }}>
                    {activeTab === "RHYTHM GAME" && currentSong ? currentSong.bpm : bpm}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 700 }}>BPM</span>
                </div>
                <div className="bpm-buttons">
                  <button 
                    className="bpm-btn" 
                    onClick={() => setBpm((b) => Math.max(40, b - 5))}
                    disabled={activeTab === "RHYTHM GAME"}
                    title="BPM -5"
                    style={{ opacity: activeTab === "RHYTHM GAME" ? 0.5 : 1, cursor: activeTab === "RHYTHM GAME" ? "not-allowed" : "pointer" }}
                  >
                    -
                  </button>
                  <button 
                    className="bpm-btn" 
                    onClick={() => setBpm((b) => Math.min(240, b + 5))}
                    disabled={activeTab === "RHYTHM GAME"}
                    title="BPM +5"
                    style={{ opacity: activeTab === "RHYTHM GAME" ? 0.5 : 1, cursor: activeTab === "RHYTHM GAME" ? "not-allowed" : "pointer" }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Time Signature Selector */}
              <div className="time-sig-row">
                <span className="control-label" style={{ fontSize: "10px", margin: 0 }}>TIME SIGNATURE</span>
                <div className="time-sig-buttons">
                  {(["4/4", "3/4", "6/8"] as const).map((sig) => (
                    <button
                      key={sig}
                      type="button"
                      className={`time-sig-btn ${timeSignature === sig ? "active" : ""}`}
                      onClick={() => setTimeSignature(sig)}
                    >
                      {sig}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Card 3: Volume */}
            <div className="glass-panel" style={{ padding: "16px" }}>
              <span className="control-label" style={{ fontSize: "11px" }}>Volume</span>
              <div className="slider-container" style={{ marginTop: "8px" }}>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="custom-slider"
                  disabled
                />
                <span style={{ fontSize: "12px", width: "24px", textAlign: "right", fontWeight: "600", opacity: 0.5 }}>{volume}</span>
              </div>
            </div>
          </aside>
        )}

        {/* CENTER INTERACTIVE PLAY AREA */}
        <section className="play-area" style={{ flex: 1, position: "relative" }}>
          {/* Synchronized Sequential Metronome Beat Indicator */}
          <BeatIndicator
            currentBeat={currentBeat}
            beatsPerBar={beatsPerBar}
            visible={metronomeOn}
          />
          {activeTab === "RUDIMENT" && !selectedRudimentDifficulty ? (
            <div className="rudiment-select-screen">
              <div className="rudiment-select-heading">
                <span className="control-label">RUDIMENTS</span>
                <h2>기본기 훈련 난이도 선택</h2>
              </div>
              <div className="rudiment-difficulty-grid">
                {([
                  { id: "EASY" as const, name: "Easy", meta: "Single Stroke Roll", detail: "스네어 중심 R L 반복" },
                  { id: "NORMAL" as const, name: "Normal", meta: "Moving Singles", detail: "하이햇, 스네어, 탐 이동" },
                  { id: "HARD" as const, name: "Hard", meta: "Paradiddle Kit Flow", detail: "전 파트 혼합 응용 패턴" },
                ]).map((difficulty) => (
                  <button
                    key={difficulty.id}
                    className={`rudiment-difficulty-card ${difficulty.id.toLowerCase()}`}
                    onClick={() => handleSelectRudimentDifficulty(difficulty.id)}
                  >
                    <span className="difficulty-name">{difficulty.name}</span>
                    <span className="difficulty-meta">{difficulty.meta}</span>
                    <span className="difficulty-detail">{difficulty.detail}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : activeTab === "RUDIMENT" && selectedRudimentDifficulty ? (
            <div className="rudiment-stage">
              <RudimentPractice
                difficulty={selectedRudimentDifficulty}
                bpm={bpm}
                isPlaying={rudimentIsPlaying}
                setIsPlaying={setRudimentIsPlaying}
                lastHitEvent={lastHitEvent}
                score={rudimentScore}
                setScore={setRudimentScore}
                drumScreenPositions={drumScreenPositions}
                onChangeDifficulty={() => {
                  setRudimentIsPlaying(false);
                  setSelectedRudimentDifficulty(null);
                  resetRudimentSession();
                }}
                setMetronomeOn={setMetronomeOn}
              />
              <div className="rudiment-drum-layer">
                <Drum3D 
                  ref={drumRef} 
                  onPartClick={handlePartClick} 
                  onDrumPositionsUpdate={setDrumScreenPositions}
                />
              </div>
            </div>
          ) : activeTab === "RHYTHM GAME" ? (
            <div className="rudiment-stage" style={{ animation: "rudiment-stage-in 0.55s ease" }}>
              <SongPractice
                isPlaying={songIsPlaying}
                setIsPlaying={setSongIsPlaying}
                lastHitEvent={lastHitEvent}
                currentSong={currentSong}
                setCurrentSong={setCurrentSong}
              />
              {songIsPlaying && (
                <div className="rudiment-drum-layer">
                  <Drum3D ref={drumRef} onPartClick={handlePartClick} />
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Fanning lane guide lines exactly matching mockup overlay */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "calc(100% - 180px)",
                  pointerEvents: "none",
                  zIndex: 0,
                }}
              >
                <svg width="100%" height="100%">
                  <line x1="34%" y1="0" x2="13.3%" y2="100%" stroke="rgba(255, 255, 255, 0.04)" strokeDasharray="3,5" strokeWidth="1" />
                  <line x1="38.5%" y1="0" x2="23.1%" y2="100%" stroke="rgba(255, 255, 255, 0.04)" strokeDasharray="3,5" strokeWidth="1" />
                  <line x1="43%" y1="0" x2="31.2%" y2="100%" stroke="rgba(255, 255, 255, 0.04)" strokeDasharray="3,5" strokeWidth="1" />
                  <line x1="47.5%" y1="0" x2="40.7%" y2="100%" stroke="rgba(255, 255, 255, 0.04)" strokeDasharray="3,5" strokeWidth="1" />
                  <line x1="52%" y1="0" x2="50%" y2="100%" stroke="rgba(255, 255, 255, 0.04)" strokeDasharray="3,5" strokeWidth="1" />
                  <line x1="56.5%" y1="0" x2="59.3%" y2="100%" stroke="rgba(255, 255, 255, 0.04)" strokeDasharray="3,5" strokeWidth="1" />
                  <line x1="61%" y1="0" x2="72.2%" y2="100%" stroke="rgba(255, 255, 255, 0.04)" strokeDasharray="3,5" strokeWidth="1" />
                  <line x1="66%" y1="0" x2="87.5%" y2="100%" stroke="rgba(255, 255, 255, 0.04)" strokeDasharray="3,5" strokeWidth="1" />
                </svg>
              </div>

              {/* Centered High-Fidelity 3D Drum Component */}
              <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 1 }}>
                <Drum3D ref={drumRef} onPartClick={handlePartClick} />
              </div>
            </>
          )}
        </section>


      </main>
      <MidiSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        inputs={midiInputs}
        midiMap={midiMap}
        learningPadId={learningPadId}
        startLearning={startLearning}
        stopLearning={stopLearning}
        resetToDefaultMapping={resetToDefaultMapping}
      />
    </div>
  );
}

export default App;
