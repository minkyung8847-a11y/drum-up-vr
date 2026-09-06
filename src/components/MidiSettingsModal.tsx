import React from "react";
import type { DrumPadId, MidiMap } from "../types";
import { DRUM_PADS_CONFIG } from "./DrumKit";
import { X, RefreshCw, Radio } from "lucide-react";

interface MidiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  inputs: MIDIInput[];
  midiMap: MidiMap;
  learningPadId: DrumPadId | null;
  startLearning: (padId: DrumPadId) => void;
  stopLearning: () => void;
  resetToDefaultMapping: () => void;
}

export const MidiSettingsModal: React.FC<MidiSettingsModalProps> = ({
  isOpen,
  onClose,
  inputs,
  midiMap,
  learningPadId,
  startLearning,
  stopLearning,
  resetToDefaultMapping,
}) => {
  if (!isOpen) return null;

  // Group mappings by pad ID to show in list
  const getNoteForPad = (padId: DrumPadId): number[] => {
    return Object.keys(midiMap)
      .map(Number)
      .filter((note) => midiMap[note] === padId);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(0,0,0,0.08)", paddingBottom: "12px" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "20px", fontWeight: "800" }}>MIDI & 드럼 설정</h2>
          <button className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* MIDI Devices Status */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
            <Radio size={14} color={inputs.length > 0 ? "var(--accent-color)" : "var(--text-tertiary)"} />
            연결된 기기 ({inputs.length}개)
          </div>
          {inputs.length === 0 ? (
            <div style={{ fontSize: "13px", color: "var(--text-tertiary)", background: "rgba(0,0,0,0.02)", padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid rgba(0,0,0,0.04)" }}>
              컴퓨터에 전자 드럼을 연결한 뒤 전원을 켜주세요.
              <br />
              <span style={{ fontSize: "11px", opacity: 0.8 }}>(MIDI 연결은 크롬, 엣지, 오페라 등 Chromium 계열 브라우저에서만 공식 지원됩니다.)</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {inputs.map((input) => (
                <div key={input.id} style={{ fontSize: "13px", fontWeight: "500", background: "rgba(0,199,129,0.05)", border: "1px solid rgba(0,199,129,0.15)", color: "var(--accent-color)", padding: "10px 14px", borderRadius: "var(--radius-sm)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{input.name || "알 수 없는 MIDI 장치"}</span>
                  <span style={{ fontSize: "10px", padding: "2px 6px", background: "var(--accent-color)", color: "#fff", borderRadius: "4px" }}>ACTIVE</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MIDI Map Section */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)" }}>드럼 패드 MIDI 매핑</span>
            <button
              onClick={resetToDefaultMapping}
              style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontWeight: "500" }}
            >
              <RefreshCw size={12} />
              초기 기본값 설정
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {DRUM_PADS_CONFIG.map((pad) => {
              const notes = getNoteForPad(pad.id);
              const isLearningThis = learningPadId === pad.id;

              return (
                <div key={pad.id} className="midi-mapping-row">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: pad.color }} />
                    <span style={{ fontSize: "13px", fontWeight: "600" }}>{pad.name}</span>
                    <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>[{pad.key}]</span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "160px" }}>
                      {notes.length === 0 ? (
                        <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>매핑 없음</span>
                      ) : (
                        notes.map((n) => (
                          <span key={n} className="midi-key-badge">
                            MIDI {n}
                          </span>
                        ))
                      )}
                    </div>

                    {isLearningThis ? (
                      <button
                        className="midi-learn-btn learning"
                        onClick={stopLearning}
                      >
                        신호 대기중...
                      </button>
                    ) : (
                      <button
                        className="midi-learn-btn"
                        onClick={() => startLearning(pad.id)}
                      >
                        타격 입력
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: "1.4", background: "rgba(0,0,0,0.02)", padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid rgba(0,0,0,0.04)" }}>
          💡 <strong>매핑 방법:</strong> [타격 입력] 버튼을 누른 후, 전자 드럼의 해당 패드를 세게 한 번 치면 입력 신호가 자동으로 인식되어 매핑됩니다.
        </div>
      </div>
    </div>
  );
};
