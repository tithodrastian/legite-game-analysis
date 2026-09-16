"use client";

import { useEffect, useRef, useState } from "react";
import "./vision.css";

type Step = "setup" | "identify-self" | "identify-partner" | "live" | "result";
type Box = { id: number; x: number; y: number; w: number; h: number; label?: string; selected?: boolean };

const players = ["Titho", "Sani", "Ridho", "Rezza"];
const initialBoxes: Box[] = [
  { id: 1, x: 16, y: 54, w: 18, h: 28 },
  { id: 2, x: 62, y: 49, w: 18, h: 29 },
  { id: 3, x: 24, y: 20, w: 15, h: 25 },
  { id: 4, x: 65, y: 18, w: 15, h: 25 },
];

export default function VisionStagingPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [step, setStep] = useState<Step>("setup");
  const [cameraError, setCameraError] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState(players);
  const [selfTrack, setSelfTrack] = useState<number | null>(null);
  const [partnerTrack, setPartnerTrack] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [boxes, setBoxes] = useState(initialBoxes);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  useEffect(() => {
    if ((step === "identify-self" || step === "identify-partner" || step === "live") && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.muted = true;
      videoRef.current.setAttribute("playsinline", "true");
      void videoRef.current.play().catch(() => {
        setCameraError("Camera sudah mendapat izin, tapi preview diblokir browser. Coba buka langsung di Safari/Chrome, bukan in-app browser.");
      });
    }
  }, [step]);

  useEffect(() => {
    if (step !== "live" || paused) return;
    const timer = window.setInterval(() => {
      setSeconds((value) => value + 1);
      setBoxes((current) => current.map((box, index) => ({
        ...box,
        x: Math.max(8, Math.min(76, box.x + Math.sin((Date.now() / 800) + index) * .22)),
        y: Math.max(12, Math.min(62, box.y + Math.cos((Date.now() / 900) + index) * .18)),
      })));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step, paused]);

  async function startCamera() {
    setCameraError("");
    if (!window.isSecureContext) {
      setCameraError("Camera web membutuhkan HTTPS. Buka staging langsung melalui link HTTPS.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Browser ini tidak menyediakan akses camera. Buka link langsung di Safari atau Chrome, bukan browser di dalam aplikasi lain.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setStep("identify-self");
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "CameraError";
      const message = error instanceof Error ? error.message : "Unknown camera error";
      setCameraError(`${name}: ${message}. Pastikan izin camera aktif dan buka langsung di Safari/Chrome.`);
    }
  }

  function chooseTrack(id: number) {
    if (step === "identify-self") {
      setSelfTrack(id);
      setBoxes((current) => current.map((box) => ({ ...box, selected: box.id === id, label: box.id === id ? selectedPlayers[0] : undefined })));
      window.setTimeout(() => setStep("identify-partner"), 250);
      return;
    }
    if (step === "identify-partner" && id !== selfTrack) {
      setPartnerTrack(id);
      setBoxes((current) => current.map((box) => ({
        ...box,
        selected: box.id === selfTrack || box.id === id,
        label: box.id === selfTrack ? selectedPlayers[0] : box.id === id ? selectedPlayers[1] : undefined,
      })));
      window.setTimeout(() => setStep("live"), 250);
    }
  }

  function finish() {
    setPaused(true);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStep("result");
  }

  function reset() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setSeconds(0);
    setPaused(false);
    setSelfTrack(null);
    setPartnerTrack(null);
    setBoxes(initialBoxes);
    setCameraError("");
    setStep("setup");
  }

  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const rallies = Math.min(31, Math.floor(seconds / 9));
  const coverage = Math.min(72, 18 + Math.floor(seconds * .8));
  const movement = Math.min(1420, Math.floor(seconds * 11));

  return <main className="vision-page">
    <div className="phone">
      <header className="top">
        <div className="brand">Le Gîte<small>PADEL</small></div>
        <button className="ava" aria-label="profile">●</button>
      </header>

      {step === "setup" && <section className="screen active">
        <h1 className="title">Live Vision.</h1>
        <p className="page-sub">Test staging untuk flow camera + identify player. Belum masuk ke production LeGîte2.0.</p>

        <div className="hero">
          <div className="hero-icon">◎</div>
          <span>LEGÎTE VISION · STAGING</span>
          <h2>Taruh HP.<br/>Main seperti biasa.</h2>
          <p>Video tidak disimpan. Untuk staging ini, player boxes adalah prototype interaction untuk menguji mekanisme identify yourself + partner.</p>
          <div className="privacy">● NO RECORDING · HTTPS CAMERA</div>
        </div>

        <div className="sec">
          <div className="head"><h2>Players</h2><small>{selectedPlayers.length} selected</small></div>
          <div className="player-grid">
            {players.map((player) => <button key={player} className={`player-chip ${selectedPlayers.includes(player) ? "selected" : ""}`} onClick={() => setSelectedPlayers((current) => current.includes(player) ? current.filter((name) => name !== player) : [...current, player])}>
              <span>{player}</span><small>{selectedPlayers.includes(player) ? "SELECTED" : "TAP TO ADD"}</small>
            </button>)}
          </div>
        </div>

        <div className="setup-card">
          <b>Camera position</b><small>Back court · landscape recommended</small>
          <div className="segment"><button className="on">BACK COURT</button><button>SIDE COURT</button></div>
        </div>

        {cameraError && <div className="error">{cameraError}</div>}
        <button className="primary" onClick={startCamera} disabled={selectedPlayers.length < 2}>Start Camera Test</button>
      </section>}

      {(step === "identify-self" || step === "identify-partner" || step === "live") && <section className="screen active">
        <div className="live-head">
          <button className="back" onClick={reset}>‹</button>
          <div><h1>{step === "live" ? "Live Analysis" : "Identify Players"}</h1><small>Back Court · Staging</small></div>
        </div>

        {cameraError && <div className="error">{cameraError}</div>}
        <div className="camera-stage">
          <video ref={videoRef} autoPlay playsInline muted />
          <div className="court-guide" />

          {boxes.map((box) => <button
            key={box.id}
            className={`track-box ${box.selected ? "selected" : ""} ${step === "live" ? "locked" : ""}`}
            style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
            onClick={() => chooseTrack(box.id)}
            disabled={step === "live"}
          >
            <span>{box.label || `P${box.id}`}</span>
          </button>)}

          {step !== "live" && <div className="identify-prompt">
            <small>{step === "identify-self" ? "STEP 1 OF 2" : "STEP 2 OF 2"}</small>
            <b>{step === "identify-self" ? "Yang mana kamu?" : "Yang mana partner kamu?"}</b>
            <span>Tap kotak pemain di camera.</span>
          </div>}

          {step === "live" && <>
            <div className="live-top"><span>● LIVE · {time}</span><span>4 PLAYERS</span></div>
            <div className="live-metrics">
              <div><b>{rallies}</b><span>RALLIES</span></div>
              <div><b>{coverage}%</b><span>COVERAGE</span></div>
              <div><b>{movement}m</b><span>MOVEMENT</span></div>
            </div>
          </>}
        </div>

        {step === "live" && <div className="live-actions">
          <button className="ghost" onClick={() => setPaused((value) => !value)}>{paused ? "Resume" : "Pause"}</button>
          <button className="primary inline" onClick={finish}>Finish Analysis</button>
        </div>}
      </section>}

      {step === "result" && <section className="screen active">
        <div className="live-head"><button className="back" onClick={reset}>‹</button><div><h1>Game DNA</h1><small>Staging Result</small></div></div>
        <div className="result-hero"><span>MATCH ANALYSIS</span><h2>{selectedPlayers[0] || "Player"}</h2><p>Observed behaviour dari staging session.</p><div><b>72<small>% COVERAGE</small></b><em>HIGH ACTIVITY</em></div></div>
        <div className="sec"><div className="head"><h2>Match Snapshot</h2><small>Prototype</small></div><div className="stats"><article><b>{Math.max(rallies, 8)}</b><span>RALLIES</span></article><article><b>24s</b><span>LONGEST</span></article><article><b>1.42</b><span>KM MOVE</span></article></div></div>
        <div className="coach"><span>LEGÎTE COACH INSIGHT</span><b>Kamu cukup aktif, tapi masih lama di back court.</b><p>Nanti insight ini berasal dari tracking yang sebenarnya. Di staging sekarang hasil dibuat fixed untuk menguji flow.</p></div>
        <button className="primary" onClick={reset}>Test Again</button>
      </section>}

      <nav className="nav"><button><b>⌂</b>Locker</button><button><b>▦</b>Match</button><button className="on"><b>◎</b>Vision</button><button><b>⬡</b>Skill</button><button><b>♛</b>Club King</button></nav>
    </div>
  </main>;
}
