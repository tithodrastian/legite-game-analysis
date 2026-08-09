"use client";

import { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  analyzeVideo,
  defaultCourtPoints,
  formatTimestamp,
  type CourtPoint,
  type Handedness,
  type PlayerPosition,
  type VideoAnalysis,
} from "@/lib/video-analyzer";

type Phase = "idle" | "ready" | "processing" | "complete" | "failed";
type Tab = "home" | "insights" | "upload" | "matches" | "profile";
type Profile = { display_name: string; level: "Beginner" | "Intermediate" | "Advanced"; preferred_side: "Left" | "Right" | "Both" };
type Match = {
  id: string;
  title: string;
  video_name: string | null;
  duration_minutes: number;
  duration_seconds: number;
  overall_score: number;
  status: string;
  played_at: string;
  analysis_version: string;
  analysis_confidence: number;
  movement_score?: number;
  distance_meters?: number;
  net_control_percent?: number;
  tracking_rate?: number;
  movement_payload?: VideoAnalysis | null;
};

const positionLabels: Record<PlayerPosition, string> = {
  "near-left": "Near · left",
  "near-right": "Near · right",
  "far-left": "Far · left",
  "far-right": "Far · right",
};

const dateLabel = (value: string) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
const durationLabel = (seconds: number) => {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
};

function AppIcon({ name }: { name: Tab }) {
  const paths = {
    home: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    insights: <><path d="M4 19V9m6 10V5m6 14v-7m4 7H2"/></>,
    upload: <><path d="M4 7h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="4"/></>,
    matches: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
    profile: <><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 3.5-6 8-6s7.2 2 8 6"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function ScoreRing({ value }: { value: number }) {
  return <div className="score-ring" style={{ "--score": `${value * 3.6}deg` } as React.CSSProperties}><div><b>{value}</b><small>/100</small></div></div>;
}

function CourtCalibrator({ points, onChange }: { points: CourtPoint[]; onChange: (points: CourtPoint[]) => void }) {
  const field = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  function move(event: ReactPointerEvent<HTMLButtonElement>, index: number) {
    if (!field.current) return;
    const rect = field.current.getBoundingClientRect();
    const next = points.map((point, pointIndex) => pointIndex === index ? {
      x: Math.min(0.98, Math.max(0.02, (event.clientX - rect.left) / rect.width)),
      y: Math.min(0.98, Math.max(0.02, (event.clientY - rect.top) / rect.height)),
    } : point);
    onChange(next);
  }

  return <div className="court-calibrator" ref={field}>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points={points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")}/><line x1={(points[0].x + points[3].x) * 50} y1={(points[0].y + points[3].y) * 50} x2={(points[1].x + points[2].x) * 50} y2={(points[1].y + points[2].y) * 50}/></svg>
    {points.map((point, index) => <button
      key={index}
      aria-label={`Court corner ${index + 1}`}
      className={dragging === index ? "dragging" : ""}
      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
      onPointerDown={(event) => { setDragging(index); event.currentTarget.setPointerCapture(event.pointerId); move(event, index); }}
      onPointerMove={(event) => { if (dragging === index) move(event, index); }}
      onPointerUp={() => setDragging(null)}
    >{index + 1}</button>)}
  </div>;
}

function CourtMap({ analysis }: { analysis: VideoAnalysis }) {
  const trail = analysis.samples.filter((sample) => sample.x >= 0 && sample.confidence >= 35);
  const path = trail.map((sample, index) => `${index ? "L" : "M"}${sample.x * 10} ${200 - sample.y * 10}`).join(" ");
  return <div className="court-map" aria-label="Court position heatmap">
    {analysis.heatmap.map((cell) => <i key={`${cell.column}-${cell.row}`} style={{ gridColumn: cell.column + 1, gridRow: 8 - cell.row, opacity: Math.max(0.05, cell.value / 100) }}/>) }
    <svg viewBox="0 0 100 200" preserveAspectRatio="none" aria-hidden="true">
      <rect x="1" y="1" width="98" height="198" rx="2"/><line x1="1" y1="100" x2="99" y2="100"/><line x1="50" y1="1" x2="50" y2="199"/>
      <path className="movement-trail" d={path}/>
      {trail.filter((_, index) => index % Math.max(1, Math.floor(trail.length / 12)) === 0).map((sample) => <circle key={sample.time} cx={sample.x * 10} cy={200 - sample.y * 10} r="1.7"/>)}
    </svg>
    <span className="net-label">NET</span><span className="you-label">YOU</span>
  </div>;
}

function MetricBar({ label, value, note }: { label: string; value: number; note: string }) {
  return <div className="metric-bar"><div><b>{label}</b><span>{value}</span></div><div className="bar-track"><i style={{ width: `${value}%` }}/></div><small>{note}</small></div>;
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("upload");
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("Preparing body tracking");
  const [notice, setNotice] = useState("");
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [playerPosition, setPlayerPosition] = useState<PlayerPosition>("near-right");
  const [handedness, setHandedness] = useState<Handedness>("right");
  const [courtPoints, setCourtPoints] = useState<CourtPoint[]>(defaultCourtPoints);
  const [courtConfirmed, setCourtConfirmed] = useState(false);
  const [analyzePartner, setAnalyzePartner] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [dataLoading, setDataLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [profile, setProfile] = useState<Profile>({ display_name: "Padel Player", level: "Beginner", preferred_side: "Both" });
  const [editingProfile, setEditingProfile] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const reviewVideo = useRef<HTMLVideoElement>(null);

  const loadData = useCallback(async (userId: string) => {
    if (!supabase) return;
    setDataLoading(true);
    const [profileResult, matchResult] = await Promise.all([
      supabase.from("analysis_profiles").select("display_name, level, preferred_side").eq("user_id", userId).maybeSingle(),
      supabase.from("analysis_matches").select("*").order("played_at", { ascending: false }),
    ]);
    if (profileResult.data) setProfile(profileResult.data as Profile);
    if (matchResult.data) {
      const next = matchResult.data as Match[];
      setMatches(next);
      setSelectedMatch((current) => current ? next.find((item) => item.id === current.id) ?? null : null);
    }
    if (profileResult.error || matchResult.error) setNotice(profileResult.error?.message || matchResult.error?.message || "Data could not be loaded.");
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setAuthLoading(false); });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const userId = session?.user.id;
    const timer = window.setTimeout(() => userId ? void loadData(userId) : setMatches([]), 0);
    return () => window.clearTimeout(timer);
  }, [session?.user.id, loadData]);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const activeAnalysis = selectedMatch?.movement_payload || analysis;
  const latest = matches.find((match) => match.analysis_version === "pose-v3") || matches[0];
  const bestMovement = matches.reduce((best, match) => Math.max(best, match.movement_score || 0), 0);
  const totalMinutes = matches.reduce((total, match) => total + match.duration_minutes, 0);
  const possibleShots = useMemo(() => activeAnalysis?.moments.filter((moment) => moment.type === "possible_shot") || [], [activeAnalysis]);
  const coachingMoments = useMemo(() => activeAnalysis?.moments.filter((moment) => moment.type !== "possible_shot") || [], [activeAnalysis]);

  function choose(next?: File) {
    if (!next || !next.type.startsWith("video/")) { setNotice("Choose an MP4, MOV, or WebM video."); return; }
    if (url) URL.revokeObjectURL(url);
    setFile(next);
    setUrl(URL.createObjectURL(next));
    setAnalysis(null);
    setSelectedMatch(null);
    setPhase("ready");
    setProgress(0);
    setCourtConfirmed(false);
    setCourtPoints(defaultCourtPoints);
    setNotice("");
  }

  async function persistAnalysis(result: VideoAnalysis) {
    if (!session || !supabase || !file) {
      setNotice("Analysis is ready. Sign in from Profile to save it.");
      return;
    }
    const payload = {
      user_id: session.user.id,
      title: file.name.replace(/\.[^.]+$/, "") || "Padel Match",
      video_name: file.name,
      duration_minutes: Math.max(1, Math.round(result.durationSeconds / 60)),
      duration_seconds: result.durationSeconds,
      overall_score: result.metrics.movementScore,
      status: "ready",
      analysis_version: result.version,
      analysis_confidence: result.analysisConfidence,
      activity_score: result.metrics.readyScore,
      source_width: result.width,
      source_height: result.height,
      sampled_frames: result.sampledFrames,
      sample_interval: result.sampleInterval,
      review_status: "reviewed",
      movement_score: result.metrics.movementScore,
      distance_meters: result.metrics.distanceMeters,
      net_control_percent: result.metrics.netControlPercent,
      tracking_rate: result.metrics.trackingRate,
      movement_payload: result,
    };
    const { data, error } = await supabase.from("analysis_matches").insert(payload).select().single();
    if (error || !data) { setNotice(error?.message || "The analysis could not be saved."); return; }
    setSelectedMatch(data as Match);
    setNotice("Movement analysis saved to your account.");
    await loadData(session.user.id);
  }

  async function startAnalysis() {
    if (!file || !courtConfirmed) { setNotice("Confirm the four court corners before starting."); return; }
    setPhase("processing");
    setProgress(2);
    setNotice("");
    try {
      const result = await analyzeVideo(file, { playerPosition, handedness, courtPoints, analyzePartner, onProgress: (value, message) => { setProgress(value); setProgressMessage(message); } });
      setAnalysis(result);
      setPhase("complete");
      setProgress(100);
      await persistAnalysis(result);
      setTab("insights");
    } catch (error) {
      setPhase("failed");
      setNotice(error instanceof Error ? error.message : "This video could not be analyzed.");
    }
  }

  async function authenticate(mode: "signin" | "signup") {
    if (!supabase) { setAuthMessage("Account service is not configured."); return; }
    setAuthMessage("Working…");
    const result = mode === "signin" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password, options: { data: { display_name: profile.display_name } } });
    if (result.error) setAuthMessage(result.error.message);
    else if (mode === "signup" && !result.data.session) setAuthMessage("Account created. Check your email, then sign in.");
    else setAuthMessage("");
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!session || !supabase) return;
    const { error } = await supabase.from("analysis_profiles").upsert({ user_id: session.user.id, ...profile, updated_at: new Date().toISOString() });
    setNotice(error ? error.message : "Profile saved.");
    if (!error) setEditingProfile(false);
  }

  async function deleteMatch(match: Match) {
    if (!supabase || !window.confirm(`Delete “${match.title}” and its analysis?`)) return;
    const { error } = await supabase.from("analysis_matches").delete().eq("id", match.id);
    if (error) { setNotice(error.message); return; }
    if (selectedMatch?.id === match.id) { setSelectedMatch(null); setAnalysis(null); }
    setNotice("Match deleted.");
    if (session) await loadData(session.user.id);
  }

  function openMatch(match: Match) {
    setSelectedMatch(match);
    setAnalysis(null);
    setPhase("complete");
    setTab("insights");
  }

  function playMoment(seconds: number) {
    if (!reviewVideo.current || !url) { setNotice("Re-select the original video to watch this saved moment. Videos are not uploaded."); return; }
    reviewVideo.current.currentTime = seconds;
    void reviewVideo.current.play();
  }

  const authCard = <article className="glass-card auth-card"><span className="eyebrow">SAVE YOUR DATA</span><h2>Sign in to keep your matches</h2><p>Your reports are private to your account. Match video stays on your device.</p><form onSubmit={(event) => { event.preventDefault(); void authenticate("signin"); }}><input aria-label="Email" type="email" placeholder="Email address" value={email} onChange={(event) => setEmail(event.target.value)} required/><input aria-label="Password" type="password" placeholder="Password · min. 6 characters" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required/><button className="primary-button" type="submit">Sign in</button><button className="text-button" type="button" onClick={() => void authenticate("signup")}>Create account</button></form>{authMessage && <small className="form-message">{authMessage}</small>}</article>;

  return <main className="stage"><div className="phone-app">
    <header className="mobile-header"><div className="wordmark"><span>L</span>Legite</div><div className="model-pill"><i/> Pose AI</div></header>
    {notice && <button className="notice" onClick={() => setNotice("")}>{notice}<span>×</span></button>}

    {tab === "home" && <section className="screen">
      <div className="page-title"><div><small>YOUR PADEL</small><h1>Hello, {profile.display_name.split(" ")[0]}</h1></div><button onClick={() => setTab("matches")} aria-label="Open match history">⌄</button></div>
      {latest?.movement_payload ? <article className="hero-card"><div><span>LAST MOVEMENT SCORE</span><h2>{latest.title}</h2><p>{dateLabel(latest.played_at)} · {durationLabel(latest.duration_seconds)}</p></div><ScoreRing value={latest.movement_score || 0}/></article> : <article className="hero-card empty-hero"><div><span>GET STARTED</span><h2>See how you move, not just how you hit</h2><p>Track positioning, recovery, balance, and partner spacing from one match video.</p></div></article>}
      <div className="quick-actions"><button onClick={() => setTab("upload")}><i>＋</i><b>Analyze a match</b><small>Body & court tracking</small></button><button onClick={() => setTab("matches")}><i>↗</i><b>Match history</b><small>{matches.length} saved reports</small></button></div>
      <div className="section-title"><h2>What you get</h2><span>Evidence-led</span></div>
      <article className="glass-card feature-list"><div><i>01</i><span><b>Court position</b><small>Heatmap and movement trail</small></span></div><div><i>02</i><span><b>Recovery & readiness</b><small>See moments that need work</small></span></div><div><i>03</i><span><b>Partner spacing</b><small>How often you move together</small></span></div></article>
    </section>}

    {tab === "upload" && <section className="screen">
      <div className="page-title"><div><small>NEW ANALYSIS</small><h1>Track your movement</h1></div><button onClick={() => setNotice("Use a fixed, full-court 1080p video. A camera behind the center glass works best.")} aria-label="Video guidance">?</button></div>
      <article className={`upload-card ${file ? "has-video" : ""}`}>
        {!file ? <><button className="upload-orb" onClick={() => fileInput.current?.click()} aria-label="Choose match video"><AppIcon name="upload"/></button><h2>Choose your match video</h2><p>Body tracking runs privately in your browser. No video upload is required.</p><button className="primary-button" onClick={() => fileInput.current?.click()}>Choose video <span>＋</span></button><div className="format-row"><span>MP4 / MOV / WEBM</span><i/><span>1080p best</span><i/><span>Fixed camera</span></div></> : <>
          <div className="video-calibration"><video ref={reviewVideo} src={url} controls playsInline/>{phase !== "processing" && <CourtCalibrator points={courtPoints} onChange={(next) => { setCourtPoints(next); setCourtConfirmed(false); }}/>}</div>
          <div className="file-row"><span><b>{file.name}</b><small>{(file.size / 1048576).toFixed(1)} MB · video stays local</small></span><button onClick={() => fileInput.current?.click()}>Change</button></div>
          <div className="setup-section"><span className="eyebrow">1 · SELECT YOUR STARTING POSITION</span><div className="court-picker">{(Object.keys(positionLabels) as PlayerPosition[]).map((position) => <button key={position} className={playerPosition === position ? "active" : ""} onClick={() => setPlayerPosition(position)}>{positionLabels[position]}</button>)}</div></div>
          <div className="setup-section"><span className="eyebrow">2 · ALIGN THE FOUR COURT CORNERS</span><p>Drag points 1–4 onto the outside court corners. This turns pixels into real court positions.</p><button className={`confirm-button ${courtConfirmed ? "confirmed" : ""}`} onClick={() => setCourtConfirmed(true)}>{courtConfirmed ? "✓ Court confirmed" : "Use these court lines"}</button></div>
          <div className="setup-row"><label>Playing hand<select value={handedness} onChange={(event) => setHandedness(event.target.value as Handedness)}><option value="right">Right-handed</option><option value="left">Left-handed</option></select></label><label className="switch-label"><span><b>Track partner</b><small>Better team insights</small></span><input type="checkbox" checked={analyzePartner} onChange={(event) => setAnalyzePartner(event.target.checked)}/><i/></label></div>
          {phase === "processing" ? <div className="analysis-progress"><div><b>{progressMessage}</b><span>{progress}%</span></div><div className="progress-track"><i style={{ width: `${progress}%` }}/></div><small>Keep this tab open. Body tracking may take a few minutes on long videos.</small></div> : <button className="primary-button wide" disabled={!courtConfirmed} onClick={() => void startAnalysis()}>{phase === "failed" ? "Try analysis again" : "Start body analysis"}<span>→</span></button>}
        </>}
        <input ref={fileInput} hidden type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(event: ChangeEvent<HTMLInputElement>) => choose(event.target.files?.[0])}/>
      </article>
      <div className="privacy-card"><span>✓</span><p><b>Private by design.</b> Only movement coordinates, scores, and timestamps are saved. Your video never leaves this device.</p></div>
    </section>}

    {tab === "insights" && <section className="screen results-screen">
      <div className="result-title"><button onClick={() => setTab("matches")} aria-label="Back to matches">‹</button><div><small>BODY & COURT REPORT</small><h1>Movement insights</h1><p>{selectedMatch?.title || file?.name || "No match selected"}</p></div><button onClick={() => setTab("upload")} aria-label="New analysis">＋</button></div>
      {!activeAnalysis ? <div className="empty-state"><b>No movement report yet</b><p>Older motion-only results do not contain body tracking. Analyze a video to create the new report.</p><button className="primary-button" onClick={() => setTab("upload")}>Analyze a match</button></div> : <>
        {url && <video ref={reviewVideo} className="review-video" src={url} controls playsInline/>}
        <article className="movement-hero"><div><span className="eyebrow">MOVEMENT SCORE</span><strong>{activeAnalysis.metrics.movementScore}<small>/100</small></strong><p>Position, recovery, readiness, balance, and partner movement combined.</p><span className={`confidence-pill ${activeAnalysis.analysisConfidence >= 75 ? "high" : "medium"}`}>{activeAnalysis.analysisConfidence}% tracking confidence</span></div><ScoreRing value={activeAnalysis.metrics.movementScore}/></article>
        <div className="metric-grid"><article><span>DISTANCE</span><b>{activeAnalysis.metrics.distanceMeters}<small> m</small></b><p>Estimated court movement</p></article><article><span>NET CONTROL</span><b>{activeAnalysis.metrics.netControlPercent}<small>%</small></b><p>Time in attacking zone</p></article><article><span>RECOVERY</span><b>{activeAnalysis.metrics.averageRecoverySeconds || "—"}<small>{activeAnalysis.metrics.averageRecoverySeconds ? "s" : ""}</small></b><p>Average return to ready</p></article><article><span>FAST MOVES</span><b>{activeAnalysis.metrics.fastMoves}</b><p>High-intensity changes</p></article></div>
        <article className="glass-card map-card"><div className="card-head"><span><i>⌁</i><b>Court position</b></span><small>{activeAnalysis.metrics.courtCoveragePercent}% coverage</small></div><CourtMap analysis={activeAnalysis}/><div className="map-key"><span><i className="heat"/>Most used area</span><span><i className="trail"/>Movement trail</span></div></article>
        <article className="glass-card"><div className="card-head"><span><i>◎</i><b>Movement breakdown</b></span><small>Pose-based</small></div><div className="breakdown"><MetricBar label="Positioning" value={activeAnalysis.metrics.positioningScore} note="Court use and net presence"/><MetricBar label="Recovery" value={activeAnalysis.metrics.recoveryScore} note="Return to a stable ready position"/><MetricBar label="Ready position" value={activeAnalysis.metrics.readyScore} note="Knee bend and stance width"/><MetricBar label="Body balance" value={activeAnalysis.metrics.balanceScore} note="Torso and foot stability"/></div></article>
        <article className="glass-card partner-card"><div className="card-head"><span><i>↔</i><b>Partner movement</b></span><small>{activeAnalysis.metrics.partnerScore ? `${activeAnalysis.metrics.partnerScore}/100` : "Not available"}</small></div>{activeAnalysis.metrics.partnerScore ? <><h2>You moved together in {activeAnalysis.metrics.partnerTogetherPercent}% of tracked moments.</h2><p>Average spacing: {activeAnalysis.metrics.averagePartnerDistance} m. The score rewards side-by-side depth and useful space between partners.</p></> : <p>Partner tracking was off or the second player was not visible enough.</p>}</article>
        <article className="glass-card moment-card"><div className="card-head"><span><i>▶</i><b>Coaching moments</b></span><small>{coachingMoments.length} found</small></div>{coachingMoments.length ? <div className="moment-list">{coachingMoments.map((moment) => <button key={moment.id} onClick={() => playMoment(moment.timestampSeconds)}><span className="moment-time">▶ {formatTimestamp(moment.timestampSeconds)}</span><span><b>{moment.title}</b><small>{moment.detail}</small></span><em>{moment.confidence}%</em></button>)}</div> : <div className="inline-empty">No clear recovery or balance warnings were found in the tracked frames.</div>}</article>
        <article className="glass-card experimental-card"><div className="card-head"><span><i>β</i><b>Possible shot moments</b></span><small>Experimental</small></div><p>These are wrist-and-body speed peaks, not confirmed ball contacts. Review the video before using them as shot stats.</p>{possibleShots.slice(0, 6).map((moment) => <button key={moment.id} onClick={() => playMoment(moment.timestampSeconds)}><b>▶ {formatTimestamp(moment.timestampSeconds)}</b><span>{moment.shotType === "forehand" ? "Forehand-like" : "Backhand-like"}</span><em>{moment.confidence}% · review</em></button>)}</article>
        <article className="method-note"><span>33</span><div><b>33 body points per tracked frame</b><p>Feet map your court position. Hips, knees, shoulders, and wrists support readiness and balance estimates. Scores are estimates—not medical or professional biomechanical measurements.</p></div></article>
      </>}
    </section>}

    {tab === "matches" && <section className="screen">
      <div className="page-title"><div><small>MATCH LIBRARY</small><h1>Your matches</h1></div><button onClick={() => session && void loadData(session.user.id)} aria-label="Refresh matches">↻</button></div>
      {!session && !authLoading ? authCard : dataLoading ? <div className="empty-state">Loading your matches…</div> : matches.length ? <div className="match-list">{matches.map((match) => <article className="match-card" key={match.id} onClick={() => openMatch(match)}><span className="match-play">▶</span><span><small>{dateLabel(match.played_at)}</small><b>{match.title}</b><em>{match.analysis_version === "pose-v3" ? `${match.distance_meters || 0} m · ${match.net_control_percent || 0}% net control` : "Older motion report"}</em></span><strong>{match.movement_score || match.analysis_confidence || 0}<small>{match.analysis_version === "pose-v3" ? "move" : "%"}</small></strong><button className="delete-button" aria-label={`Delete ${match.title}`} onClick={(event) => { event.stopPropagation(); void deleteMatch(match); }}>×</button></article>)}</div> : <div className="empty-state"><b>No saved matches yet</b><p>Analyze a video and your movement report will appear here.</p><button className="primary-button" onClick={() => setTab("upload")}>Analyze a match</button></div>}
    </section>}

    {tab === "profile" && <section className="screen">
      <div className="page-title"><div><small>ACCOUNT</small><h1>Your profile</h1></div><button onClick={() => setEditingProfile(true)} aria-label="Edit profile">⚙</button></div>
      {!session && !authLoading ? authCard : session ? <><article className="profile-card"><div className="profile-avatar">{profile.display_name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div><div><h2>{profile.display_name}</h2><p>{profile.level} · {profile.preferred_side} side</p></div><button onClick={() => setEditingProfile(!editingProfile)}>{editingProfile ? "Close" : "Edit"}</button></article>{editingProfile && <form className="glass-card profile-form" onSubmit={(event) => void saveProfile(event)}><label>Name<input value={profile.display_name} onChange={(event) => setProfile({ ...profile, display_name: event.target.value })} required/></label><label>Level<select value={profile.level} onChange={(event) => setProfile({ ...profile, level: event.target.value as Profile["level"] })}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label><label>Preferred side<select value={profile.preferred_side} onChange={(event) => setProfile({ ...profile, preferred_side: event.target.value as Profile["preferred_side"] })}><option>Left</option><option>Right</option><option>Both</option></select></label><button className="primary-button" type="submit">Save profile</button></form>}<div className="profile-stats"><article><b>{matches.length}</b><small>Matches</small></article><article><b>{(totalMinutes / 60).toFixed(1)}h</b><small>Video</small></article><article><b>{bestMovement || "—"}</b><small>Best movement</small></article></div><article className="glass-card settings-list"><button onClick={() => setEditingProfile(true)}><span><b>Player setup</b><small>Level and court side</small></span><i>›</i></button><button onClick={() => setTab("matches")}><span><b>My data</b><small>View or delete match history</small></span><i>›</i></button><button onClick={() => void supabase?.auth.signOut()}><span><b>Sign out</b><small>{session.user.email}</small></span><i>›</i></button></article></> : <div className="empty-state">Checking your account…</div>}
    </section>}

    <nav className="bottom-nav" aria-label="Main navigation">{([
      ["home", "Home"], ["insights", "Insights"], ["upload", "Analyze"], ["matches", "Matches"], ["profile", "Profile"],
    ] as Array<[Tab, string]>).map(([id, label]) => <button key={id} className={`${tab === id ? "active " : ""}${id === "upload" ? "capture" : ""}`} onClick={() => setTab(id)}><span><AppIcon name={id}/></span><small>{label}</small></button>)}</nav>
  </div></main>;
}
