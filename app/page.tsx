"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Phase = "idle" | "ready" | "processing" | "complete";
type ShotType = "forehand" | "backhand" | "bandeja" | "bajada" | "lob" | "error";
type ShotStat = { id?: string; match_id?: string; shot_type: ShotType; quality: number; attempts: number; winners: number; errors: number };
type Match = { id: string; title: string; video_name: string | null; duration_minutes: number; overall_score: number; status: string; played_at: string; analysis_shot_stats?: ShotStat[] };
type Profile = { display_name: string; level: "Beginner" | "Intermediate" | "Advanced"; preferred_side: "Left" | "Right" | "Both" };

const sampleStats: ShotStat[] = [
  { shot_type: "forehand", quality: 74, attempts: 42, winners: 8, errors: 5 },
  { shot_type: "backhand", quality: 66, attempts: 35, winners: 5, errors: 7 },
  { shot_type: "bandeja", quality: 78, attempts: 18, winners: 6, errors: 2 },
  { shot_type: "bajada", quality: 64, attempts: 11, winners: 3, errors: 3 },
  { shot_type: "lob", quality: 75, attempts: 24, winners: 4, errors: 2 },
  { shot_type: "error", quality: 48, attempts: 19, winners: 0, errors: 19 },
];
const shotLabels: Record<ShotType, string> = { forehand: "Forehand", backhand: "Backhand", bandeja: "Bandeja", bajada: "Bajada", lob: "Lob", error: "Point errors" };
const colors = ["lime", "blue", "violet", "yellow", "pink"];

const icon = (name: "grid" | "chart" | "camera" | "history" | "user") => {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    chart: <><path d="M4 19V9m6 10V5m6 14v-7m4 7H2"/></>,
    camera: <><path d="M4 7h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="4"/></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 3.5-6 8-6s7.2 2 8 6"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
};

function Ring({ value = 0 }: { value?: number }) {
  return <div className="score-ring" style={{"--score": `${value * 3.6}deg`} as React.CSSProperties}><div><b>{value}</b><small>/100</small></div></div>;
}

const dateLabel = (value: string) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
const durationLabel = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes || 1}m`;

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [progress, setProgress] = useState(0);
  const [tab, setTab] = useState("camera");
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [dataLoading, setDataLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [currentStats, setCurrentStats] = useState<ShotStat[]>(sampleStats);
  const [profile, setProfile] = useState<Profile>({ display_name: "Padel Player", level: "Beginner", preferred_side: "Both" });
  const [editingProfile, setEditingProfile] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async (userId: string) => {
    if (!supabase) return;
    setDataLoading(true);
    const [profileResult, matchResult] = await Promise.all([
      supabase.from("analysis_profiles").select("display_name, level, preferred_side").eq("user_id", userId).maybeSingle(),
      supabase.from("analysis_matches").select("*, analysis_shot_stats(*)").order("played_at", { ascending: false }),
    ]);
    if (profileResult.data) setProfile(profileResult.data as Profile);
    if (matchResult.data) {
      const next = matchResult.data as Match[];
      setMatches(next);
      setSelectedMatch((current) => current ? next.find((item) => item.id === current.id) ?? next[0] ?? null : next[0] ?? null);
    }
    const message = profileResult.error?.message || matchResult.error?.message;
    if (message) setNotice(message);
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
    const timer = window.setTimeout(() => {
      if (userId) void loadData(userId);
      else { setMatches([]); setSelectedMatch(null); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [session?.user.id, loadData]);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const activeStats = useMemo(() => selectedMatch?.analysis_shot_stats?.length ? selectedMatch.analysis_shot_stats : currentStats, [selectedMatch, currentStats]);
  const activeScore = selectedMatch?.overall_score ?? (phase === "complete" ? 74 : 0);
  const bestScore = matches.reduce((best, match) => Math.max(best, match.overall_score), 0);
  const totalMinutes = matches.reduce((total, match) => total + match.duration_minutes, 0);
  const totalErrors = activeStats.reduce((total, stat) => total + stat.errors, 0);
  const latest = matches[0];

  function choose(next?: File) {
    if (!next || !next.type.startsWith("video/")) return;
    if (url) URL.revokeObjectURL(url);
    setFile(next); setUrl(URL.createObjectURL(next)); setPhase("ready"); setProgress(0); setNotice("");
  }

  async function saveAnalysis() {
    setCurrentStats(sampleStats); setPhase("complete");
    if (!session || !supabase) { setNotice("Result ready. Sign in from Profile to save it to your match history."); setSelectedMatch(null); setTab("stats"); return; }
    const duration = file ? Math.max(1, Math.round(file.size / 9_000_000)) : 60;
    const { data: match, error } = await supabase.from("analysis_matches").insert({ user_id: session.user.id, title: file?.name.replace(/\.[^.]+$/, "") || "Padel Match", video_name: file?.name || null, duration_minutes: Math.min(duration, 600), overall_score: 74, status: "ready" }).select().single();
    if (error || !match) { setNotice(error?.message || "Could not save this result."); setTab("stats"); return; }
    const { error: statsError } = await supabase.from("analysis_shot_stats").insert(sampleStats.map((stat) => ({ ...stat, match_id: match.id, user_id: session.user.id })));
    setNotice(statsError ? statsError.message : "Analysis saved to your match history.");
    await loadData(session.user.id);
    setSelectedMatch({ ...match, analysis_shot_stats: sampleStats } as Match); setTab("stats");
  }

  function analyze() {
    setPhase("processing"); setProgress(8); setNotice("");
    const timer = window.setInterval(() => setProgress((current) => {
      const next = Math.min(100, current + 11);
      if (next === 100) { window.clearInterval(timer); window.setTimeout(() => void saveAnalysis(), 300); }
      return next;
    }), 260);
  }

  async function authenticate(mode: "signin" | "signup") {
    if (!supabase) { setAuthMessage("Supabase is not configured yet."); return; }
    setAuthMessage("Working…");
    const result = mode === "signin" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password, options: { data: { display_name: profile.display_name } } });
    if (result.error) setAuthMessage(result.error.message);
    else if (mode === "signup" && !result.data.session) setAuthMessage("Account created. Check your email to confirm, then sign in.");
    else setAuthMessage("");
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!session || !supabase) return;
    const { error } = await supabase.from("analysis_profiles").upsert({ user_id: session.user.id, ...profile, updated_at: new Date().toISOString() });
    setNotice(error ? error.message : "Profile saved."); if (!error) setEditingProfile(false);
  }

  async function deleteMatch(match: Match) {
    if (!supabase || !window.confirm(`Delete “${match.title}” from your history?`)) return;
    const { error } = await supabase.from("analysis_matches").delete().eq("id", match.id);
    if (error) { setNotice(error.message); return; }
    setNotice("Match deleted."); if (selectedMatch?.id === match.id) setSelectedMatch(null); if (session) await loadData(session.user.id);
  }

  function openMatch(match: Match) { setSelectedMatch(match); setCurrentStats(match.analysis_shot_stats || []); setPhase("complete"); setTab("stats"); }

  const authCard = <article className="white-card auth-card"><span className="card-label">SAVE YOUR DATA</span><h2>Sign in to keep your matches</h2><p>Your history and profile are protected and only visible to your account.</p><form onSubmit={(event) => { event.preventDefault(); void authenticate("signin"); }}><input aria-label="Email" type="email" placeholder="Email address" value={email} onChange={(event) => setEmail(event.target.value)} required/><input aria-label="Password" type="password" placeholder="Password · min. 6 characters" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required/><button className="black-button" type="submit">Sign in</button><button className="text-button" type="button" onClick={() => void authenticate("signup")}>Create account</button></form>{authMessage && <small className="form-message">{authMessage}</small>}</article>;

  return <main className="stage"><div className="phone-app"><header className="mobile-header"><div className="wordmark"><span>L</span>Legite</div><div className="header-actions"><button aria-label="Notifications">◔<i/></button><button aria-label="More options">⋮</button></div></header>{notice && <button className="notice" onClick={() => setNotice("")}>{notice}<span>×</span></button>}
    {tab === "home" ? <section className="screen app-page"><div className="page-title"><div><small>YOUR PADEL</small><h1>Hello, {profile.display_name.split(" ")[0]}</h1></div><button aria-label="Open calendar">⌄</button></div>{latest ? <article className="overview-card"><div><span>LAST MATCH</span><h2>{latest.title}</h2><p>{dateLabel(latest.played_at)} · {durationLabel(latest.duration_minutes)}</p></div><div className="overview-score"><b>{latest.overall_score}</b><small>shot quality</small></div></article> : <article className="overview-card empty-overview"><div><span>GET STARTED</span><h2>Your first match starts here</h2><p>Upload a video to create your first report.</p></div></article>}<div className="quick-actions"><button onClick={() => setTab("camera")}><i>＋</i><b>Analyze a match</b><small>Upload a new video</small></button><button onClick={() => setTab("history")}><i>↗</i><b>Match history</b><small>{matches.length} saved matches</small></button></div><div className="section-title"><h2>Latest progress</h2><button onClick={() => latest && openMatch(latest)}>See insights ›</button></div><article className="white-card progress-card"><div className="progress-top"><span><b>Shot quality</b><small>Recent matches</small></span><strong>{matches.length ? `+${Math.max(0, matches[0].overall_score - (matches[1]?.overall_score || matches[0].overall_score))}` : "—"}</strong></div><div className="bars">{(matches.length ? [...matches].slice(0,4).reverse() : [{overall_score:28},{overall_score:28},{overall_score:28},{overall_score:28}]).map((item,i)=><i key={i} className={!matches.length?"muted":""} style={{height:`${Math.max(20,item.overall_score)}%`}}><small>{i+1}</small></i>)}</div></article><article className="white-card next-tip"><i>◎</i><div><b>Next focus</b><p>{latest?"Review your lowest-quality shot in Insights.":"Record the full court from behind the glass."}</p></div><button>›</button></article></section>
    : tab === "history" ? <section className="screen app-page"><div className="page-title"><div><small>MATCH LIBRARY</small><h1>Your matches</h1></div><button aria-label="Refresh matches" onClick={() => session && void loadData(session.user.id)}>↻</button></div>{!session && !authLoading ? authCard : dataLoading ? <div className="empty-state">Loading your matches…</div> : matches.length ? <div className="match-list">{matches.map((match)=><article className="match-card" key={match.id} onClick={() => openMatch(match)}><span className="match-play">▶</span><span><small>{dateLabel(match.played_at)}</small><b>{match.title}</b><em>{durationLabel(match.duration_minutes)} · {match.status}</em></span><strong>{match.overall_score}<small>/100</small></strong><button className="delete-button" aria-label={`Delete ${match.title}`} onClick={(event)=>{event.stopPropagation();void deleteMatch(match);}}>×</button></article>)}</div> : <div className="empty-state"><b>No saved matches yet</b><p>Analyze a video and it will appear here.</p><button className="black-button" onClick={()=>setTab("camera")}>Analyze a match</button></div>}</section>
    : tab === "profile" ? <section className="screen app-page"><div className="page-title"><div><small>ACCOUNT</small><h1>Your profile</h1></div><button aria-label="Profile settings">⚙</button></div>{!session && !authLoading ? authCard : session ? <><article className="profile-card"><div className="profile-avatar">{profile.display_name.split(" ").map((part)=>part[0]).join("").slice(0,2).toUpperCase()}</div><div><h2>{profile.display_name}</h2><p>{profile.level} · {profile.preferred_side} side</p></div><button onClick={()=>setEditingProfile(!editingProfile)}>{editingProfile?"Close":"Edit"}</button></article>{editingProfile && <form className="white-card profile-form" onSubmit={(event)=>void saveProfile(event)}><label>Name<input value={profile.display_name} onChange={(event)=>setProfile({...profile,display_name:event.target.value})} required/></label><label>Level<select value={profile.level} onChange={(event)=>setProfile({...profile,level:event.target.value as Profile["level"]})}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label><label>Preferred side<select value={profile.preferred_side} onChange={(event)=>setProfile({...profile,preferred_side:event.target.value as Profile["preferred_side"]})}><option>Left</option><option>Right</option><option>Both</option></select></label><button className="black-button" type="submit">Save profile</button></form>}<div className="profile-stats"><article><b>{matches.length}</b><small>Matches</small></article><article><b>{(totalMinutes/60).toFixed(1)}h</b><small>Video</small></article><article><b>{bestScore||"—"}</b><small>Best score</small></article></div><article className="white-card settings-list"><button onClick={()=>setEditingProfile(true)}><span><b>Player setup</b><small>Level and court side</small></span><i>›</i></button><button onClick={()=>setTab("history")}><span><b>My data</b><small>View or delete match history</small></span><i>›</i></button><button onClick={()=>void supabase?.auth.signOut()}><span><b>Sign out</b><small>{session.user.email}</small></span><i>›</i></button></article></> : <div className="empty-state">Checking your account…</div>}</section>
    : tab === "stats" ? <section className="screen results-screen"><div className="result-title"><button onClick={() => setTab("history")}>‹</button><div><small>ANALYSIS RESULT</small><h1>Match summary</h1><p>{selectedMatch?.title || file?.name || "No match selected"}</p></div><button>↗</button></div>{!selectedMatch && phase!=="complete" ? <div className="empty-state"><b>No insight selected</b><p>Open a saved match or analyze a new video.</p><button className="black-button" onClick={()=>setTab("camera")}>Analyze a match</button></div> : <><article className="hero-score"><div><span className="card-label">SHOT QUALITY</span><strong>{activeScore}<small>/100</small></strong><p>{selectedMatch?"Saved securely to your history":"Sample analysis from this video"}</p></div><Ring value={activeScore}/></article><div className="stat-pair"><article><span>WINNERS</span><b>{activeStats.reduce((sum,stat)=>sum+stat.winners,0)}</b><div className="mini-track"><i style={{width:"56%"}}/></div><p>Across all detected shots</p></article><article><span>TOTAL ERRORS</span><b>{totalErrors}</b><div className="error-key"><i/>{activeStats.find((stat)=>stat.shot_type==="error")?.errors||0} point errors</div></article></div><article className="white-card shot-card"><div className="card-head"><span><i className="round-icon">⌁</i><b>Shot quality</b></span></div>{activeStats.filter((stat)=>stat.shot_type!=="error").map((stat,index)=><div className="shot-row" key={stat.shot_type}><span><b>{shotLabels[stat.shot_type]}</b><small>{stat.attempts} shots</small></span><div className="shot-track"><i className={colors[index]} style={{width:`${stat.quality}%`}}/></div><strong>{stat.quality}</strong></div>)}</article><article className="white-card insight"><div className="card-head"><span><i className="round-icon green">↗</i><b>Tip for you</b></span></div><h2>Your lob is your strongest defensive option.</h2><p>Use it earlier when you are under pressure behind the service line.</p><div className="focus"><span>NEXT PRACTICE</span><b>Focus on depth before adding more speed.</b></div></article>{!selectedMatch&&<p className="demo-note">Shot detection is simulated in this version. Database saving is live.</p>}</>}</section>
    : <section className="screen upload-screen"><div className="page-title"><div><small>VIDEO ANALYSIS</small><h1>Upload a match</h1></div><button aria-label="Help">?</button></div><article className={file?"upload-panel selected":"upload-panel"}>{!file ? <><button className="upload-orb" onClick={()=>fileInput.current?.click()} aria-label="Choose a match video">{icon("camera")}</button><h2>Choose your match video</h2><p>Record from behind with the full court in view</p><button className="black-button" onClick={()=>fileInput.current?.click()}>Choose video <span>＋</span></button><div className="format-row"><span>MP4 / MOV</span><i/><span>1080p works best</span><i/><span>Read locally</span></div></> : <><video className="video" src={url} controls playsInline/><div className="file-detail"><div className="mini-play">▶</div><span><b>{file.name}</b><small>{(file.size/1048576).toFixed(1)} MB · Ready</small></span><button onClick={()=>fileInput.current?.click()}>Change</button></div>{phase==="processing"?<div className="analysis-progress"><div><b>Checking your match…</b><span>{progress}%</span></div><div className="track"><i style={{width:`${progress}%`}}/></div><small>Finding rallies, shots, and points</small></div>:<button className="black-button wide" onClick={analyze}>Start analysis <span>→</span></button>}</>}<input ref={fileInput} hidden type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(event:ChangeEvent<HTMLInputElement>)=>choose(event.target.files?.[0])}/></article><article className="tip-card"><div className="tip-icon">⌁</div><div><b>For a clearer result</b><p>Place the camera behind the center glass. Keep all four players in view.</p></div><button>›</button></article><div className="privacy-note"><span>✓</span><p><b>Your video stays on this device.</b><br/>Only match details and statistics are saved.</p></div></section>}
    <nav className="bottom-nav" aria-label="Main navigation">{[{id:"home",label:"Home",ico:"grid"},{id:"stats",label:"Insights",ico:"chart"},{id:"camera",label:"Upload",ico:"camera"},{id:"history",label:"Matches",ico:"history"},{id:"profile",label:"Profile",ico:"user"}].map((item)=><button key={item.id} className={`${tab===item.id?"active ":""}${item.id==="camera"?"capture":""}`} onClick={()=>setTab(item.id)}><span>{icon(item.ico as "grid")}</span><small>{item.label}</small></button>)}</nav>
  </div></main>;
}
