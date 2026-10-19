import React, { useCallback, useEffect, useRef, useState } from "react";
import type { SongChart, NoteEvent, DrumPadId, GameScore } from "../types";
import { GameCanvas } from "./GameCanvas";
import { createTimingTrack, drumChart, toNoteEvents } from "./songPracticeTiming";
import { 
  Play, 
  Plus, 
  Trash2, 
  ArrowLeft, 
  RotateCcw, 
  AlertTriangle, 
  Check, 
  Upload, 
  Music, 
  Award,
  Search
} from "lucide-react";

interface SongPracticeProps {
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  lastHitEvent: { padId: any; time: number } | null;
  currentSong: SongChart | null;
  setCurrentSong: (song: SongChart | null) => void;
}

interface SavedSong extends SongChart {
  originalFileName: string;
  createdAt: string;
}

type ViewState = "playlist" | "add_song" | "preview" | "playing" | "summary";

// Normalise pad labels
const DRUM_PAD_LABELS: Record<DrumPadId, string> = {
  kick: "Kick (베이스)",
  snare: "Snare (스네어)",
  "hihat-closed": "Closed Hi-Hat (하이햇)",
  "hihat-open": "Open Hi-Hat (오픈 하이햇)",
  "hihat-pedal": "Pedal Hi-Hat (하이햇 페달)",
  "tom-high": "High Tom (탐1)",
  "tom-mid": "Mid Tom (탐2)",
  "tom-floor": "Floor Tom (탐3)",
  crash: "Crash Cymbal (크래쉬)",
  ride: "Ride Cymbal (라이드)"
};

// Seeding 3 default grooves to localStorage if empty
const generateDemoSong = (
  id: string,
  title: string,
  artist: string,
  bpm: number,
  difficulty: "Easy" | "Medium" | "Hard",
  duration: number
): SavedSong => {
  return {
    id, title, artist, bpm, difficulty, duration,
    notes: toNoteEvents(drumChart),
    originalFileName: "Demo Groove",
    createdAt: new Date().toISOString()
  };
};

const parseMusicXML = (
  xmlText: string,
  defaultBpm: number
): {
  notes: NoteEvent[];
  duration: number;
  detectedParts: string[];
  warningCount: number;
} => {
  const notes: NoteEvent[] = [];
  const detectedPartsSet = new Set<DrumPadId>();
  let warningCount = 0;

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");

  const parseError = xmlDoc.getElementsByTagName("parsererror")[0];
  if (parseError) {
    throw new Error("Invalid XML file structure: " + parseError.textContent);
  }

  // 1. Build part/instrument id map to MIDI notes
  const instrumentMap: Record<string, number> = {};
  const scoreParts = xmlDoc.getElementsByTagName("score-part");
  for (let i = 0; i < scoreParts.length; i++) {
    const instruments = scoreParts[i].getElementsByTagName("score-instrument");
    for (let j = 0; j < instruments.length; j++) {
      const instId = instruments[j].getAttribute("id");
      const midiUnpitched = instruments[j].getElementsByTagName("midi-unpitched")[0]?.textContent 
                         || instruments[j].getElementsByTagName("midi-note")[0]?.textContent;
      if (instId && midiUnpitched) {
        instrumentMap[instId] = parseInt(midiUnpitched, 10);
      }
    }
  }

  // 2. Extract tempo/BPM if present
  let fileBpm = defaultBpm;
  const soundTags = xmlDoc.getElementsByTagName("sound");
  for (let i = 0; i < soundTags.length; i++) {
    const tempoAttr = soundTags[i].getAttribute("tempo");
    if (tempoAttr) {
      fileBpm = parseFloat(tempoAttr);
      break;
    }
  }

  // 3. Process measures
  const measures = xmlDoc.getElementsByTagName("measure");
  let divisions = 1;
  let measureStartBeats = 0;
  let maxTimeInSeconds = 0;

  for (let m = 0; m < measures.length; m++) {
    const measure = measures[m];
    let currentTimeInBeats = measureStartBeats;
    let lastNoteStartBeats = measureStartBeats;
    let measureDurationInBeats = 4; // default

    const attributes = measure.getElementsByTagName("attributes")[0];
    if (attributes) {
      const divTag = attributes.getElementsByTagName("divisions")[0];
      if (divTag) {
        divisions = parseFloat(divTag.textContent || "1") || 1;
      }
      const timeTag = attributes.getElementsByTagName("time")[0];
      if (timeTag) {
        const beatsTag = timeTag.getElementsByTagName("beats")[0];
        if (beatsTag) {
          measureDurationInBeats = parseFloat(beatsTag.textContent || "4") || 4;
        }
      }
    }

    const children = measure.children;
    for (let c = 0; c < children.length; c++) {
      const child = children[c];
      const nodeName = child.nodeName.toLowerCase();

      if (nodeName === "note") {
        const isChord = child.getElementsByTagName("chord").length > 0;
        const isRest = child.getElementsByTagName("rest").length > 0;
        const grace = child.getElementsByTagName("grace").length > 0;

        let dur = parseFloat(child.getElementsByTagName("duration")[0]?.textContent || "0") || 0;
        if (grace) dur = 0;

        const noteStartBeats = isChord ? lastNoteStartBeats : currentTimeInBeats;
        if (!isChord) {
          lastNoteStartBeats = currentTimeInBeats;
        }

        if (!isRest) {
          const instTag = child.getElementsByTagName("instrument")[0];
          const instId = instTag?.getAttribute("id");
          let midiNote = instId ? instrumentMap[instId] : undefined;

          if (midiNote === undefined) {
            const midiNoteTag = child.getElementsByTagName("midi-note")[0];
            if (midiNoteTag) {
              midiNote = parseInt(midiNoteTag.textContent || "", 10);
            }
          }

          let padId: DrumPadId | null = null;

          if (midiNote !== undefined) {
            // General MIDI unpitched drum keys
            if (midiNote === 35 || midiNote === 36) padId = "kick";
            else if (midiNote === 38 || midiNote === 40) padId = "snare";
            else if (midiNote === 42 || midiNote === 22) padId = "hihat-closed";
            else if (midiNote === 46 || midiNote === 26) padId = "hihat-open";
            else if (midiNote === 44) padId = "hihat-pedal";
            else if (midiNote === 41 || midiNote === 47 || midiNote === 48) padId = "tom-high";
            else if (midiNote === 45) padId = "tom-mid";
            else if (midiNote === 43) padId = "tom-floor";
            else if (midiNote === 49 || midiNote === 57 || midiNote === 52) padId = "crash";
            else if (midiNote === 51 || midiNote === 59 || midiNote === 53) padId = "ride";
          }

          // Fallback based on display staff positions
          if (!padId) {
            const stepTag = child.getElementsByTagName("display-step")[0] 
                         || child.getElementsByTagName("step")[0];
            const octTag = child.getElementsByTagName("display-octave")[0]
                        || child.getElementsByTagName("octave")[0];
            const noteheadTag = child.getElementsByTagName("notehead")[0];

            if (stepTag && octTag) {
              const step = stepTag.textContent?.trim().toUpperCase();
              const oct = parseInt(octTag.textContent || "0", 10);
              const notehead = noteheadTag?.textContent?.trim().toLowerCase();

              if (step === "F" && oct === 4) padId = "kick";
              else if (step === "C" && oct === 5) padId = "snare";
              else if (step === "G" && oct === 5) {
                if (notehead === "x" || notehead === "cross") padId = "hihat-closed";
                else if (notehead === "circle-x" || notehead === "x-circle") padId = "hihat-open";
                else padId = "hihat-closed";
              }
              else if (step === "A" && oct === 5) padId = "crash";
              else if (step === "F" && oct === 5) padId = "ride";
              else if (step === "E" && oct === 5) padId = "tom-high";
              else if (step === "D" && oct === 5) padId = "tom-mid";
              else if (step === "A" && oct === 4) padId = "tom-floor";
              else if (step === "D" && oct === 4) padId = "hihat-pedal";
            }
          }

          if (padId) {
            const timeInSeconds = noteStartBeats * (60.0 / fileBpm);
            notes.push({
              time: parseFloat(timeInSeconds.toFixed(3)),
              padId
            });
            maxTimeInSeconds = Math.max(maxTimeInSeconds, timeInSeconds);
            detectedPartsSet.add(padId);
          } else {
            warningCount++;
          }
        }

        if (!isChord) {
          currentTimeInBeats += dur / divisions;
        }
      } 
      else if (nodeName === "backup") {
        const dur = parseFloat(child.getElementsByTagName("duration")[0]?.textContent || "0") || 0;
        currentTimeInBeats -= dur / divisions;
      } 
      else if (nodeName === "forward") {
        const dur = parseFloat(child.getElementsByTagName("duration")[0]?.textContent || "0") || 0;
        currentTimeInBeats += dur / divisions;
      }
    }

    measureStartBeats += measureDurationInBeats;
  }

  const detectedParts = Array.from(detectedPartsSet).map(p => DRUM_PAD_LABELS[p] || p);
  const duration = parseFloat((maxTimeInSeconds + 4.0).toFixed(1));

  return {
    notes: notes.sort((a, b) => a.time - b.time),
    duration,
    detectedParts,
    warningCount
  };
};

export const SongPractice: React.FC<SongPracticeProps> = ({
  isPlaying,
  setIsPlaying,
  currentSong,
  setCurrentSong
}) => {
  // Navigation View State
  const [view, setViewState] = useState<ViewState>("playlist");
  const [songs, setSongs] = useState<SavedSong[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Add Song Form State
  const [formTitle, setFormTitle] = useState("");
  const [formArtist, setFormArtist] = useState("");
  const [formBpm, setFormBpm] = useState(120);
  const [formDifficulty, setFormDifficulty] = useState<"Easy" | "Medium" | "Hard">("Easy");
  const [formTimeSignature, setFormTimeSignature] = useState("4/4");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // File Upload Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisWarning, setAnalysisWarning] = useState<string | null>(null);
  const [detectedParts, setDetectedParts] = useState<string[]>([]);
  const [parsedNotes, setParsedNotes] = useState<NoteEvent[]>([]);
  const [parsedDuration, setParsedDuration] = useState(0);

  // Media time for the existing progress UI; canvas reads audio.currentTime directly.
  const [songTime, setSongTime] = useState<number>(0);
  const [score] = useState<GameScore>({
    score: 0,
    combo: 0,
    maxCombo: 0,
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0,
    accuracy: 0
  });

  // Score labels remain in the designed UI, but scoring is inactive in this step.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const updateSongTime = useCallback((time: number) => setSongTime(time), []);

  // Load and seed songs list from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("drumup_song_playlist");
    if (saved) {
      // Refresh only the built-in demo charts; preserve saved user charts.
      setSongs((JSON.parse(saved) as SavedSong[]).map(song =>
        ["demo-1", "demo-2", "demo-3"].includes(song.id)
          ? { ...song, notes: toNoteEvents(drumChart) }
          : song
      ));
    } else {
      const demoList = [
        generateDemoSong("demo-1", "Basic Rock Groove", "DrumUp Studio", 120, "Easy", 30),
        generateDemoSong("demo-2", "Syncopated Funk Beat", "Groove Syndicate", 100, "Medium", 30),
        generateDemoSong("demo-3", "Double Bass Metal Loop", "Anarchy Pedals", 140, "Hard", 30)
      ];
      localStorage.setItem("drumup_song_playlist", JSON.stringify(demoList));
      setSongs(demoList);
    }
  }, []);

  // Save playlist helper
  const savePlaylist = (updated: SavedSong[]) => {
    localStorage.setItem("drumup_song_playlist", JSON.stringify(updated));
    setSongs(updated);
  };

  // Prepare the media source only on song selection, never on pause/resume.
  useEffect(() => {
    const audio = audioRef.current;
    if (view !== "playing" || !currentSong || !audio) return;
    const url = URL.createObjectURL(createTimingTrack(currentSong.notes, currentSong.duration));
    audio.src = url;
    audio.load();
    setSongTime(0);
    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
    };
  }, [currentSong, view]);

  // The media element owns elapsed time. React's flag only requests play/pause.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || view !== "playing" || !currentSong) return;
    if (!isPlaying) {
      audio.pause();
      return;
    }
    let cancelled = false;
    void audio.play().catch((error: unknown) => {
      if (cancelled) return; // Source changed or playback was deliberately stopped.
      console.error("Song Practice audio playback failed:", error);
      setIsPlaying(false);
    });
    return () => { cancelled = true; };
  }, [isPlaying, currentSong, view, setIsPlaying]);

  const restartSong = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setSongTime(audio.currentTime);
    setIsPlaying(true);
  };

  // Handle file analysis trigger
  const handleAnalyzeFile = () => {
    if (!selectedFile) return;

    setIsAnalyzing(true);
    setAnalysisProgress(10);
    setAnalysisWarning(null);

    const isXml = selectedFile.name.endsWith(".xml") || selectedFile.name.endsWith(".musicxml");

    if (isXml) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        try {
          setAnalysisProgress(50);
          const parsed = parseMusicXML(text, formBpm);
          setAnalysisProgress(100);

          setParsedNotes(parsed.notes);
          setParsedDuration(parsed.duration);
          setDetectedParts(parsed.detectedParts);

          if (parsed.warningCount > 0) {
            setAnalysisWarning(`${parsed.warningCount}개의 드럼 기호가 알 수 없는 형식으로 인식되어 생략되었습니다.`);
          }
          if (parsed.notes.length === 0) {
            throw new Error("악보에서 인식 가능한 드럼 노트 데이터가 하나도 발견되지 않았습니다.");
          }

          setTimeout(() => {
            setIsAnalyzing(false);
            setViewState("preview");
          }, 600);
        } catch (err: any) {
          console.error(err);
          setIsAnalyzing(false);
          alert(`MusicXML 파싱 중 오류가 발생했습니다: ${err.message}`);
        }
      };
      reader.readAsText(selectedFile);
    } else {
      // Image/PDF transcription is not part of the synchronization step.
      const testNotes = toNoteEvents(drumChart);
      setParsedNotes(testNotes);
      setParsedDuration(30);
      setDetectedParts([...new Set(testNotes.map(note => DRUM_PAD_LABELS[note.padId]))]);
      setAnalysisWarning("현재는 자동 분석을 실행하지 않습니다. 수동 테스트 차트와 동기화 확인용 음원을 사용합니다.");
      setAnalysisProgress(100);
      setIsAnalyzing(false);
      setViewState("preview");
    }
  };

  // Save the analyzed song
  const handleSaveSong = () => {
    const newSong: SavedSong = {
      id: "song-" + Date.now(),
      title: formTitle || selectedFile?.name.split(".")[0] || "My New Song",
      artist: formArtist || "Unknown Artist",
      bpm: formBpm,
      difficulty: formDifficulty,
      duration: parsedDuration,
      notes: parsedNotes,
      originalFileName: selectedFile?.name || "Uploaded Sheet",
      createdAt: new Date().toISOString()
    };

    const updated = [newSong, ...songs];
    savePlaylist(updated);

    // Reset fields
    setFormTitle("");
    setFormArtist("");
    setFormBpm(120);
    setFormDifficulty("Easy");
    setSelectedFile(null);

    setViewState("playlist");
  };

  // Remove song
  const handleDeleteSong = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("정말로 이 곡을 재생목록에서 삭제하시겠습니까?")) {
      const updated = songs.filter(s => s.id !== id);
      savePlaylist(updated);
    }
  };

  // Select and trigger playing song
  const handlePlaySong = (song: SongChart) => {
    setCurrentSong(song);
    setIsPlaying(true);
    setViewState("playing");
  };


  const filteredSongs = songs.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 1. PLAYLIST VIEW
  if (view === "playlist") {
    return (
      <div className="glass-panel" style={{ width: "100%", height: "100%", padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "22px", fontWeight: "850" }}>SONG PRACTICE</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "2px" }}>악보를 등록하고 언제든지 플레이 리스트에서 바로 연주하세요.</p>
          </div>
          <button 
            className="action-btn" 
            style={{ width: "auto", padding: "8px 16px", background: "var(--accent-color)" }}
            onClick={() => setViewState("add_song")}
          >
            <Plus size={16} /> ADD SONG
          </button>
        </div>

        {/* Search */}
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Search size={16} color="var(--text-secondary)" style={{ position: "absolute", left: "12px" }} />
          <input
            type="text"
            placeholder="곡 제목 또는 아티스트 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px 10px 38px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              background: "var(--bg-card)",
              fontSize: "13px",
              outline: "none"
            }}
          />
        </div>

        {/* Playlist Container */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", paddingRight: "4px" }}>
          {filteredSongs.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "200px", border: "1px dashed rgba(0,0,0,0.1)", borderRadius: "var(--radius-md)", color: "var(--text-tertiary)", gap: "10px" }}>
              <Music size={40} strokeWidth={1.5} />
              <span style={{ fontSize: "13px" }}>등록된 곡이 없습니다. 새로운 곡을 추가해 보세요!</span>
            </div>
          ) : (
            filteredSongs.map((song) => (
              <div 
                key={song.id} 
                className="selection-card" 
                onClick={() => handlePlaySong(song)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px 20px",
                  background: "var(--bg-card)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                  cursor: "pointer",
                  transition: "all 0.2s ease"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div style={{ width: "40px", height: "40px", borderRadius: "8px", background: "rgba(255, 109, 45, 0.08)", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", color: "var(--accent-color)" }}>
                    <Music size={18} />
                  </div>
                  <div>
                    <h3 style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: "700", color: "var(--text-primary)" }}>{song.title}</h3>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px", fontSize: "11px", color: "var(--text-secondary)" }}>
                      <span>{song.artist}</span>
                      <span>•</span>
                      <span>BPM {song.bpm}</span>
                      <span>•</span>
                      <span>길이 {Math.floor(song.duration / 60)}분 {Math.round(song.duration % 60)}초</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span className={`badge ${song.difficulty.toLowerCase()}`}>{song.difficulty}</span>
                  <button 
                    onClick={(e) => handleDeleteSong(song.id, e)} 
                    style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "6px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s" }}
                    onMouseEnter={(e) => e.currentTarget.style.color = "var(--danger-color)"}
                    onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-tertiary)"}
                    title="곡 삭제"
                  >
                    <Trash2 size={15} />
                  </button>
                  <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "var(--accent-color)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffffff" }}>
                    <Play size={12} fill="#000000" style={{ marginLeft: "2px" }} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // 2. ADD SONG VIEW
  if (view === "add_song") {
    return (
      <div className="glass-panel" style={{ width: "100%", height: "100%", padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button 
            onClick={() => setViewState("playlist")} 
            style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center" }}
          >
            <ArrowLeft size={18} />
          </button>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "20px", fontWeight: "800" }}>NEW SONG 등록</h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", flex: 1, overflowY: "auto", paddingRight: "4px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div className="control-group">
              <span className="control-label">Song Title *</span>
              <input
                type="text"
                placeholder="곡 제목 입력"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "var(--radius-sm)", fontSize: "13px" }}
              />
            </div>
            
            <div className="control-group">
              <span className="control-label">Artist (선택)</span>
              <input
                type="text"
                placeholder="아티스트명 입력"
                value={formArtist}
                onChange={(e) => setFormArtist(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "var(--radius-sm)", fontSize: "13px" }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div className="control-group">
                <span className="control-label">BPM *</span>
                <input
                  type="number"
                  min="40"
                  max="280"
                  value={formBpm}
                  onChange={(e) => setFormBpm(parseInt(e.target.value) || 120)}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "var(--radius-sm)", fontSize: "13px" }}
                />
              </div>

              <div className="control-group">
                <span className="control-label">Time Signature</span>
                <select
                  value={formTimeSignature}
                  onChange={(e) => setFormTimeSignature(e.target.value)}
                  className="custom-select"
                >
                  <option value="4/4">4/4</option>
                  <option value="3/4">3/4</option>
                  <option value="6/8">6/8</option>
                </select>
              </div>
            </div>

            <div className="control-group">
              <span className="control-label">Difficulty</span>
              <select
                value={formDifficulty}
                onChange={(e) => setFormDifficulty(e.target.value as any)}
                className="custom-select"
              >
                <option value="Easy">Easy (초급)</option>
                <option value="Medium">Medium (중급)</option>
                <option value="Hard">Hard (고급)</option>
              </select>
            </div>
          </div>

          {/* File Uploader */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <span className="control-label">Drum Sheet 악보 등록 *</span>
            <div 
              style={{
                flex: 1,
                border: "2px dashed rgba(0,0,0,0.1)",
                borderRadius: "var(--radius-md)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px",
                background: "rgba(255, 255, 255, 0.01)",
                textAlign: "center",
                gap: "12px",
                cursor: "pointer",
                position: "relative"
              }}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <Upload size={40} color="var(--accent-color)" />
              <div>
                <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-primary)" }}>
                  {selectedFile ? selectedFile.name : "클릭하여 드럼 악보 파일 업로드"}
                </span>
                <p style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                  지원 형식: MusicXML, XML (정확함) / PNG, JPG (AI 예측 분석)
                </p>
              </div>
              <input
                id="file-input"
                type="file"
                accept=".musicxml,.xml,.png,.jpg,.jpeg"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                style={{ display: "none" }}
              />
            </div>

            {selectedFile && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(255, 109, 45, 0.06)", border: "1px solid rgba(255, 109, 45, 0.15)", borderRadius: "var(--radius-sm)", padding: "10px 12px", fontSize: "12px" }}>
                <Check size={14} color="var(--accent-color)" />
                <span style={{ color: "var(--text-primary)", fontWeight: "500" }}>{selectedFile.name} 파일 준비 완료</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.04)", paddingTop: "16px" }}>
          <button className="action-btn secondary" onClick={() => setViewState("playlist")} style={{ flex: 1 }}>
            취소
          </button>
          <button 
            className="action-btn" 
            onClick={handleAnalyzeFile} 
            disabled={!selectedFile || !formTitle}
            style={{ flex: 1, background: (!selectedFile || !formTitle) ? "var(--text-tertiary)" : "var(--accent-color)" }}
          >
            악보 분석 & 변환 시작
          </button>
        </div>

        {/* Analysis Modal Loading Overlay */}
        {isAnalyzing && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: "360px", padding: "24px", alignItems: "center", textAlign: "center", gap: "16px" }}>
              <div className="progress-bar" style={{ height: "8px", borderRadius: "4px", width: "100%" }}>
                <div className="progress-fill" style={{ width: `${analysisProgress}%` }} />
              </div>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: "700" }}>
                악보 데이터 분석 중... ({analysisProgress}%)
              </h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "12px", lineHeight: "1.4" }}>
                악보의 박자선, 드럼 기호 위치 및 음표 타이밍을 분석하여 리듬게임용 노트 데이터로 변환하고 있습니다.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. ANALYZED PREVIEW VIEW
  if (view === "preview") {
    const fileExtension = selectedFile?.name.split(".").pop()?.toLowerCase();
    const isImage = ["png", "jpg", "jpeg"].includes(fileExtension || "");

    return (
      <div className="glass-panel" style={{ width: "100%", height: "100%", padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "20px", fontWeight: "850", color: "var(--accent-color)" }}>✓ SONG ANALYZED</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "2px" }}>악보 데이터 변환 결과입니다. 확인 후 저장하세요.</p>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto", paddingRight: "4px" }}>
          {/* Metadata Card */}
          <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.04)", borderRadius: "var(--radius-md)", padding: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
            <div><span style={{ color: "var(--text-secondary)" }}>Song Title:</span> <strong style={{ color: "var(--text-primary)" }}>{formTitle}</strong></div>
            <div><span style={{ color: "var(--text-secondary)" }}>BPM / Time:</span> <strong>{formBpm} BPM / {formTimeSignature}</strong></div>
            <div><span style={{ color: "var(--text-secondary)" }}>Artist:</span> <strong>{formArtist || "Unknown"}</strong></div>
            <div><span style={{ color: "var(--text-secondary)" }}>Total Notes:</span> <strong style={{ color: "var(--accent-color)" }}>{parsedNotes.length} Notes</strong></div>
          </div>

          {/* Warning Message */}
          {analysisWarning && (
            <div style={{ background: isImage ? "rgba(255, 109, 45, 0.06)" : "rgba(255, 109, 45, 0.05)", border: isImage ? "1px solid rgba(255, 109, 45, 0.2)" : "1px solid rgba(255, 109, 45, 0.15)", borderRadius: "var(--radius-sm)", padding: "12px 14px", fontSize: "11px", color: isImage ? "#FF6D2D" : "#FF6D2D", display: "flex", gap: "8px", alignItems: "flex-start", lineHeight: "1.5" }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: "1px" }} />
              <div>
                <strong>악보 분석 알림:</strong>
                <div style={{ marginTop: "3px" }}>{analysisWarning}</div>
              </div>
            </div>
          )}

          {/* Detected Parts list */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span className="control-label">Detected Drum Parts ({detectedParts.length})</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {detectedParts.map((part, index) => (
                <div key={index} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "var(--bg-card)", border: "1px solid rgba(255, 255, 255, 0.04)", borderRadius: "var(--radius-sm)", fontSize: "12px" }}>
                  <Check size={14} color="#FF6D2D" strokeWidth={3} />
                  <span>{part}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.04)", paddingTop: "16px" }}>
          <button className="action-btn secondary" onClick={() => setViewState("add_song")} style={{ flex: 1 }}>
            다시 업로드
          </button>
          <button className="action-btn" onClick={handleSaveSong} style={{ flex: 1, background: "var(--accent-color)" }}>
            SAVE SONG & 저장
          </button>
        </div>
      </div>
    );
  }

  // 4. ACTIVE GAMEPLAY STAGE VIEW
  if (view === "playing" && currentSong) {
    return (
      <div className="rudiment-practice">
        <audio
          ref={audioRef}
          data-song-practice-audio
          hidden
          preload="auto"
          onPlay={event => { if (!event.currentTarget.paused) setIsPlaying(true); }}
          onPause={event => { if (event.currentTarget.paused) setIsPlaying(false); }}
          onEnded={() => { setIsPlaying(false); setViewState("summary"); }}
          onError={event => {
            if (event.currentTarget.error) {
              console.error("Song Practice audio could not load:", event.currentTarget.error);
              setIsPlaying(false);
            }
          }}
        />
        {/* Topbar matching Rudiment Practice */}
        <div className="rudiment-topbar">
          <div className="rudiment-title-block">
            <span className={`badge ${currentSong.difficulty.toLowerCase()}`}>
              {currentSong.difficulty}
            </span>
            <div>
              <h2>{currentSong.title}</h2>
              <p>{currentSong.artist}</p>
            </div>
          </div>
          
          <div className="rudiment-stats">
            <span>Score <strong>{score.score}</strong></span>
            <span>Combo <strong>{score.combo}</strong></span>
            <span>Accuracy <strong>{score.accuracy}%</strong></span>
            <span>Time <strong>{Math.floor(songTime)}s / {Math.round(currentSong.duration)}s</strong></span>
          </div>

          <div className="rudiment-actions">
            <button
              className="action-btn secondary"
              onClick={restartSong}
              title="다시 시작"
            >
              <RotateCcw size={14} />
            </button>
            <button 
              className="action-btn secondary" 
              onClick={() => {
                setIsPlaying(false);
                setViewState("playlist");
              }}
            >
              중단
            </button>
          </div>
        </div>

        {/* Pattern progress visual bar */}
        <div className="rudiment-pattern-strip" style={{ background: "rgba(255, 109, 45, 0.05)", color: "var(--accent-color)", display: "flex", justifyContent: "space-between", padding: "8px 16px" }}>
          <span>BPM: <strong>{currentSong.bpm}</strong></span>
          <span style={{ width: "60%", background: "rgba(255, 255, 255, 0.05)", height: "6px", borderRadius: "3px", alignSelf: "center", overflow: "hidden", display: "inline-block" }}>
            <div style={{ background: "var(--accent-color)", height: "100%", width: `${Math.min(100, (songTime / currentSong.duration) * 100)}%` }} />
          </span>
          <span>진행률: <strong>{Math.min(100, Math.round((songTime / currentSong.duration) * 100))}%</strong></span>
        </div>

        {/* Scrolling notes game canvas */}
        <div className="rhythm-game-container">
          <GameCanvas
            audioRef={audioRef}
            notes={currentSong.notes}
            onTimeUpdate={updateSongTime}
          />
        </div>
      </div>
    );
  }

  // 5. SUMMARY STATS SCORE VIEW
  if (view === "summary" && currentSong) {
    return (
      <div 
        style={{
          width: "100%",
          height: "100%",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-card)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)"
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "12px", width: "100%", maxWidth: "420px" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "rgba(255, 109, 45, 0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-color)" }}>
            <Award size={36} />
          </div>
          
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "24px", fontWeight: "850" }}>연주 완료!</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
            곡명: <strong>{currentSong.title}</strong>
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "14px",
              width: "100%",
              margin: "18px 0",
              background: "rgba(255, 255, 255, 0.015)",
              padding: "20px",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(255, 255, 255, 0.04)"
            }}
          >
            <div style={{ textAlign: "left", fontSize: "13px", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div>최종 점수:</div>
              <div>정확도:</div>
              <div>최대 콤보:</div>
              <div>Perfect 판정:</div>
              <div>Great 판정:</div>
              <div>Good 판정:</div>
              <div>Miss 판정:</div>
            </div>
            <div style={{ textAlign: "right", fontSize: "13px", fontWeight: "700", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ color: "var(--accent-color)", fontSize: "15px" }}>{score.score} 점</div>
              <div>{score.accuracy}%</div>
              <div>{score.maxCombo} Combo</div>
              <div style={{ color: "#FF6D2D" }}>{score.perfect}</div>
              <div style={{ color: "#FF6D2D" }}>{score.great}</div>
              <div style={{ color: "#FF6D2D" }}>{score.good}</div>
              <div style={{ color: "#FF6D2D" }}>{score.miss}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", width: "100%" }}>
            <button 
              className="action-btn secondary" 
              onClick={() => {
                setViewState("playlist");
                setCurrentSong(null);
              }} 
              style={{ flex: 1 }}
            >
              재생목록으로
            </button>
            <button 
              className="action-btn" 
              onClick={() => handlePlaySong(currentSong)} 
              style={{ flex: 1, background: "var(--accent-color)" }}
            >
              다시 연주하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
