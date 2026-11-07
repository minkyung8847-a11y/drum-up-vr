import React, { useCallback, useEffect, useRef, useState } from "react";
import type { SongChart, DrumPadId } from "../types";
import { GameCanvas } from "./GameCanvas";
import { drumChart, toNoteEvents } from "./songPracticeTiming";
import { GM_DRUM_PADS, parseDrumMapping } from './songDrumMapping';
import type { SongHitPad } from './songDrumMapping';
import { BASIC_DRUM_BEAT, BASIC_DRUM_BEAT_ID } from './basicDrumBeat';
import { parseDrumMidi, parseDrumMusicXML } from './songScoreParser';
import { createSongMedia, createSongScorer, DEFAULT_SONG_WINDOWS, emptySongScore, openHeadsetSong, songBpmAt } from './songPlayback';
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
  hitListener: React.RefObject<((event: { padId: SongHitPad; time: number }) => void) | null>;
  currentSong: SongChart | null;
  setCurrentSong: (song: SongChart | null) => void;
}

interface SavedSong extends SongChart {
  originalFileName: string;
  createdAt: string;
}

type ViewState = "playlist" | "add_song" | "preview" | "playing" | "summary";
const recordings = new Map<string, { file: File; offset: number }>();

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

export const SongPractice: React.FC<SongPracticeProps> = ({
  isPlaying,
  setIsPlaying,
  hitListener,
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
  const [parsedChart, setParsedChart] = useState<ReturnType<typeof parseDrumMidi> | null>(null);
  const parsedNotes = parsedChart?.notes ?? [];
  const parsedDuration = parsedChart?.duration ?? 0;
  const detectedParts = [...new Set(parsedNotes.map(note => DRUM_PAD_LABELS[note.padId]))];
  const [mappingText, setMappingText] = useState('');

  // Media time for the existing progress UI; canvas reads audio.currentTime directly.
  const [songTime, setSongTime] = useState<number>(0);
  const [score, setScore] = useState(emptySongScore);
  const [judgment, setJudgment] = useState('');
  const [audioFile, setAudioFile] = useState<File>();
  const [audioOffset, setAudioOffset] = useState(0);
  const [mediaOffset, setMediaOffset] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [windows, setWindows] = useState(DEFAULT_SONG_WINDOWS);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaChangingRef = useRef(false);
  const scorerRef = useRef<ReturnType<typeof createSongScorer> | null>(null);
  const updateSongTime = useCallback((time: number) => {
    setSongTime(time);
    if (!audioRef.current?.paused && !audioRef.current?.seeking) {
      const result = scorerRef.current?.advance(time - mediaOffset);
      if (result) { setScore(result); setJudgment('MISS'); }
    }
  }, [mediaOffset]);

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
    mediaChangingRef.current = true;
    const { url, offset } = createSongMedia({ chart: currentSong, audio: audioFile, offset: 0 });
    setMediaOffset(offset);
    audio.src = url;
    audio.load();
    setSongTime(0);
    setMediaDuration(0);
    return () => {
      mediaChangingRef.current = true;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
    };
  }, [currentSong, view, audioFile]);

  useEffect(() => { if (audioFile) setMediaOffset(audioOffset); }, [audioFile, audioOffset]);

  useEffect(() => {
    if (view !== 'playing' || !currentSong) return;
    const scorer = createSongScorer(currentSong.notes, windows);
    scorerRef.current = scorer;
    setScore(scorer.reset((audioRef.current?.currentTime ?? 0) - mediaOffset));
    setJudgment('');
    return () => { scorerRef.current = null; };
  }, [currentSong, view, windows, mediaOffset, audioFile]);

  useEffect(() => {
    if (view !== 'playing') return;
    hitListener.current = event => {
      const audio = audioRef.current;
      if (!audio || audio.paused || audio.seeking) return;
      const time = audio.currentTime - mediaOffset - (performance.now() - event.time) / 1000 * audio.playbackRate;
      const hit = scorerRef.current?.hit(event.padId, time);
      if (hit) { setScore(hit.score); setJudgment(hit.result.toUpperCase()); }
    };
    return () => { hitListener.current = null; };
  }, [hitListener, mediaOffset, view]);

  // The media element owns elapsed time. React's flag only requests play/pause.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || view !== "playing" || !currentSong) return;
    if (!isPlaying) {
      audio.pause();
      return;
    }
    let cancelled = false;
    void audio.play().then(() => {
      if (!cancelled) mediaChangingRef.current = false;
    }).catch((error: unknown) => {
      if (cancelled) return; // Source changed or playback was deliberately stopped.
      mediaChangingRef.current = false;
      console.error("Song Practice audio playback failed:", error);
      setIsPlaying(false);
    });
    return () => { cancelled = true; };
  }, [isPlaying, currentSong, view, setIsPlaying, audioFile]);

  const restartSong = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    const result = scorerRef.current?.reset(-mediaOffset);
    if (result) setScore(result);
    setJudgment('');
    setSongTime(audio.currentTime);
    setIsPlaying(true);
  };

  const handleAnalyzeFile = async () => {
    if (!selectedFile) return;
    setIsAnalyzing(true);
    setAnalysisProgress(20);
    setAnalysisWarning(null);
    try {
      const mapping = parseDrumMapping(mappingText);
      const extension = selectedFile.name.split(".").at(-1)?.toLowerCase();
      const parsed = extension === "mid" || extension === "midi"
        ? parseDrumMidi(await selectedFile.arrayBuffer(), mapping)
        : extension === "xml" || extension === "musicxml"
          ? parseDrumMusicXML(await selectedFile.text(), formBpm, mapping, formTimeSignature)
          : undefined;
      if (!parsed) throw Error("MIDI 또는 MusicXML 악보를 선택해 주세요. PDF와 이미지는 악보 인식이 필요합니다.");
      setParsedChart(parsed);
      setFormBpm(parsed.bpm);
      setFormTimeSignature(`${parsed.meterMap[0].numerator}/${parsed.meterMap[0].denominator}`);
      setAnalysisProgress(100);
      setAnalysisWarning(parsed.skipped ? `현재 드럼에 매핑할 수 없는 기호 ${parsed.skipped}개를 생략했습니다.` : null);
      setViewState("preview");
    } catch (error) {
      setAnalysisWarning(error instanceof Error ? error.message : String(error));
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Save the analyzed song
  const handleSaveSong = () => {
    if (!parsedChart) return;
    const newSong: SavedSong = {
      id: "song-" + Date.now(),
      title: formTitle || selectedFile?.name.split(".")[0] || "My New Song",
      artist: formArtist || "Unknown Artist",
      bpm: formBpm,
      difficulty: formDifficulty,
      duration: parsedDuration,
      notes: parsedNotes,
      tempoMap: parsedChart.tempoMap,
      meterMap: parsedChart.meterMap,
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
    const recording = song.id === BASIC_DRUM_BEAT_ID ? undefined : recordings.get(song.id);
    setAudioFile(recording?.file);
    setAudioOffset(recording?.offset ?? 0);
    setCurrentSong(song);
    setIsPlaying(true);
    setViewState("playing");
  };


  const filteredSongs = [{ ...BASIC_DRUM_BEAT, originalFileName: 'Built-in test pattern', createdAt: '' },
    ...songs.filter(song => song.id !== BASIC_DRUM_BEAT_ID)].filter(
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
                      {song.id === BASIC_DRUM_BEAT_ID && <span>4/4 TIME · 4 BARS</span>}
                      <span>•</span>
                      <span>길이 {Math.floor(song.duration / 60)}분 {Math.round(song.duration % 60)}초</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span className={`badge ${song.difficulty.toLowerCase()}`}>{song.difficulty}</span>
                  {song.id !== BASIC_DRUM_BEAT_ID && <button
                    onClick={(e) => handleDeleteSong(song.id, e)} 
                    style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "6px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s" }}
                    onMouseEnter={(e) => e.currentTarget.style.color = "var(--danger-color)"}
                    onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-tertiary)"}
                    title="곡 삭제"
                  >
                    <Trash2 size={15} />
                  </button>}
                  {song.id === BASIC_DRUM_BEAT_ID ? <button className="action-btn" onClick={event => {
                    event.stopPropagation();
                    handlePlaySong(song);
                  }}>PLAY</button> : <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "var(--accent-color)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffffff" }}>
                    <Play size={12} fill="#000000" style={{ marginLeft: "2px" }} />
                  </div>}
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
                <span className="control-label">BPM (악보에 없을 때)</span>
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
                <span className="control-label">박자표 (악보에 없을 때)</span>
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
                  MIDI, MusicXML 지원 · PDF와 이미지는 별도 악보 인식 필요
                </p>
              </div>
              <input
                id="file-input"
                type="file"
                accept=".mid,.midi,.musicxml,.xml"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                style={{ display: "none" }}
              />
            </div>
            <details>
              <summary>GM 드럼 매핑</summary>
              <label>악기 매핑 변경 (MIDI 번호 → 패드 ID)
                <textarea value={mappingText} onChange={event => setMappingText(event.target.value)} placeholder={'{"52":"crash"}'} />
              </label>
              <small>{Object.entries(GM_DRUM_PADS).map(([key, pad]) => `${key}: ${pad}`).join(' · ')}</small>
            </details>
            {analysisWarning && <p role="alert">{analysisWarning}</p>}

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
            disabled={!selectedFile || isAnalyzing}
            style={{ flex: 1, background: !selectedFile ? "var(--text-tertiary)" : "var(--accent-color)" }}
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
    return (
      <div className="glass-panel" style={{ width: "100%", height: "100%", padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "20px", fontWeight: "850", color: "var(--accent-color)" }}>✓ SONG ANALYZED</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "2px" }}>악보 데이터 변환 결과입니다. 확인 후 저장하세요.</p>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto", paddingRight: "4px" }}>
          {/* Metadata Card */}
          <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.04)", borderRadius: "var(--radius-md)", padding: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
            <div><span style={{ color: "var(--text-secondary)" }}>Song Title:</span> <strong style={{ color: "var(--text-primary)" }}>{formTitle || selectedFile?.name.replace(/\.[^.]+$/, '')}</strong></div>
            <div><span style={{ color: "var(--text-secondary)" }}>BPM / Time:</span> <strong>{formBpm} BPM / {formTimeSignature}</strong></div>
            <div><span style={{ color: "var(--text-secondary)" }}>Artist:</span> <strong>{formArtist || "Unknown"}</strong></div>
            <div><span style={{ color: "var(--text-secondary)" }}>Total Notes:</span> <strong style={{ color: "var(--accent-color)" }}>{parsedNotes.length} Notes</strong></div>
          </div>

          {/* Warning Message */}
          {analysisWarning && (
            <div style={{ background: "rgba(255, 109, 45, 0.05)", border: "1px solid rgba(255, 109, 45, 0.15)", borderRadius: "var(--radius-sm)", padding: "12px 14px", fontSize: "11px", color: "#FF6D2D", display: "flex", gap: "8px", alignItems: "flex-start", lineHeight: "1.5" }}>
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
          <button className="action-btn secondary" onClick={() => {
            const url = URL.createObjectURL(new Blob([JSON.stringify(parsedChart, null, 2)], { type: 'application/json' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = 'drum-score.json';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}>JSON 저장</button>
          <button className="action-btn" onClick={handleSaveSong} style={{ flex: 1, background: "var(--accent-color)" }}>
            SAVE SONG & 저장
          </button>
        </div>
      </div>
    );
  }

  // 4. ACTIVE GAMEPLAY STAGE VIEW
  if (view === "playing" && currentSong) {
    const basic = currentSong.id === BASIC_DRUM_BEAT_ID;
    const scoreTime = songTime - mediaOffset;
    const elapsed = basic ? Math.max(0, scoreTime) : songTime;
    const duration = basic ? currentSong.duration : mediaDuration || currentSong.duration;
    return (
      <div className="rudiment-practice">
        <audio
          ref={audioRef}
          data-song-practice-audio
          hidden
          preload="auto"
          onPlay={event => { if (!event.currentTarget.paused) setIsPlaying(true); }}
          onPause={event => { if (!mediaChangingRef.current && event.currentTarget.paused) setIsPlaying(false); }}
          onLoadedMetadata={event => setMediaDuration(event.currentTarget.duration)}
          onSeeked={event => {
            const result = scorerRef.current?.reset(event.currentTarget.currentTime - mediaOffset);
            if (result) setScore(result);
            setJudgment('');
          }}
          onEnded={() => { setIsPlaying(false); setViewState("summary");
            const result = scorerRef.current?.finish();
            if (result) setScore(result);
          }}
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
              <p>{currentSong.artist}{basic && ' · BPM 120 · 4/4 TIME · 4 BARS'}</p>
            </div>
          </div>
          
          <div className="rudiment-stats">
            <span>Score <strong>{score.score}</strong></span>
            <span>Combo <strong>{score.combo}</strong></span>
            <span>Accuracy <strong>{score.accuracy}%</strong></span>
            <span>Time <strong>{Math.floor(elapsed)}s / {Math.round(duration)}s</strong></span>
            <output aria-live="polite" aria-label="연주 판정">{judgment}</output>
            {basic && <output aria-label="프리롤">{scoreTime < 0
              ? `COUNT IN ${Math.min(4, Math.ceil(-scoreTime * 2))}` : 'PLAYING'}</output>}
          </div>

          <div className="rudiment-actions">
            <button className="action-btn secondary" onClick={() => setIsPlaying(!isPlaying)}>{basic ? isPlaying ? 'PAUSE' : 'PLAY' : isPlaying ? '일시정지' : '재생'}</button>
            <button className="action-btn secondary" onClick={() => {
              setIsPlaying(false);
              openHeadsetSong({ chart: currentSong, audio: audioFile, offset: audioOffset, windows });
            }}>VR / AR</button>
            <button
              className="action-btn secondary"
              onClick={restartSong}
              title={basic ? 'RESTART' : '다시 시작'}
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
        <details className="song-practice-settings">
          <summary>음원 연결 및 타격 설정</summary>
          {!basic && <label>연결할 음원 <input type="file" accept="audio/*" onChange={event => {
            const file = event.target.files?.[0];
            if (file) recordings.set(currentSong.id, { file, offset: audioOffset });
            else recordings.delete(currentSong.id);
            setAudioFile(file);
          }} /></label>}
          {audioFile && <label>악보 시작 오프셋 (초) <input type="number" step="0.001" value={audioOffset}
            onChange={event => {
              const offset = event.target.valueAsNumber || 0;
              recordings.set(currentSong.id, { file: audioFile, offset });
              setAudioOffset(offset);
            }} /></label>}
          {audioFile && mediaDuration > 0 && currentSong.notes.some(note => note.time + mediaOffset > mediaDuration) &&
            <p>연결한 음원이 마지막 노트보다 먼저 끝납니다. 음원과 시작 오프셋을 확인해 주세요.</p>}
          {(['perfect', 'great'] as const).map(kind => <label key={kind}>{kind.toUpperCase()} (ms) <input type="number"
            min={kind === 'perfect' ? 1 : windows.perfect} max={kind === 'perfect' ? windows.great : 500} value={windows[kind]}
            onChange={event => {
              const value = event.target.valueAsNumber;
              if (!Number.isFinite(value)) return;
              setWindows(previous => ({ ...previous, [kind]: kind === 'perfect'
                ? Math.max(1, Math.min(value, previous.great)) : Math.max(previous.perfect, Math.min(value, 500)) }));
            }} /></label>)}
        </details>

        {/* Pattern progress visual bar */}
        <div className="rudiment-pattern-strip" style={{ background: "rgba(255, 109, 45, 0.05)", color: "var(--accent-color)", display: "flex", justifyContent: "space-between", padding: "8px 16px", pointerEvents: 'auto' }}>
          <span>BPM: <strong>{songBpmAt(currentSong, songTime - mediaOffset)}</strong></span>
          <input aria-label="재생 위치" type="range" min={0} max={mediaDuration || currentSong.duration} step={0.01}
            value={songTime} style={{ width: '60%' }} onChange={event => {
              if (audioRef.current) audioRef.current.currentTime = event.target.valueAsNumber;
            }} />
          <span>진행률: <strong>{Math.min(100, Math.round(elapsed / duration * 100))}%</strong></span>
        </div>

        {/* Scrolling notes game canvas */}
        <div className="rhythm-game-container">
          <GameCanvas
            audioRef={audioRef}
            notes={currentSong.notes}
            offset={mediaOffset}
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
              {currentSong.id !== BASIC_DRUM_BEAT_ID && <div>Good 판정:</div>}
              <div>Miss 판정:</div>
            </div>
            <div style={{ textAlign: "right", fontSize: "13px", fontWeight: "700", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ color: "var(--accent-color)", fontSize: "15px" }}>{score.score} 점</div>
              <div>{score.accuracy}%</div>
              <div>{score.maxCombo} Combo</div>
              <div aria-label="PERFECT 횟수" style={{ color: "#FF6D2D" }}>{score.perfect}</div>
              <div aria-label="GREAT 횟수" style={{ color: "#FF6D2D" }}>{score.great}</div>
              {currentSong.id !== BASIC_DRUM_BEAT_ID && <div style={{ color: "#FF6D2D" }}>{score.good}</div>}
              <div aria-label="MISS 횟수" style={{ color: "#FF6D2D" }}>{score.miss}</div>
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
