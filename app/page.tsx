"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

type Phase = "idle" | "ready" | "processing" | "complete";
const shots = [
  { name: "Forehand", value: 74, total: 42, color: "lime" },
  { name: "Backhand", value: 66, total: 35, color: "blue" },
  { name: "Lob", value: 75, total: 24, color: "violet" },
  { name: "Overhead", value: 78, total: 18, color: "yellow" },
  { name: "After-glass shot", value: 64, total: 11, color: "pink" },
];

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

function Ring({ value = 74 }: { value?: number }) {
  return <div className="score-ring" style={{"--score": `${value * 3.6}deg`} as React.CSSProperties}><div><b>{value}</b><small>/100</small></div></div>;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [progress, setProgress] = useState(0);
  const [tab, setTab] = useState("camera");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  function choose(next?: File) {
    if (!next || !next.type.startsWith("video/")) return;
    if (url) URL.revokeObjectURL(url);
    setFile(next); setUrl(URL.createObjectURL(next)); setPhase("ready"); setProgress(0);
  }

  function analyze() {
    setPhase("processing"); setProgress(8);
    const timer = window.setInterval(() => setProgress((current) => {
      const next = Math.min(100, current + 11);
      if (next === 100) { window.clearInterval(timer); window.setTimeout(() => { setPhase("complete"); setTab("stats"); }, 300); }
      return next;
    }), 260);
  }

  return (
    <main className="stage">
      <div className="phone-app">
        <header className="mobile-header">
          <div className="wordmark"><span>L</span>Legite</div>
          <div className="header-actions"><button aria-label="Notifications">◔<i /></button><button aria-label="More options">⋮</button></div>
        </header>

        {tab === "home" ? <section className="screen app-page">
          <div className="page-title"><div><small>YOUR PADEL</small><h1>Good afternoon</h1></div><button aria-label="Open calendar">⌄</button></div>
          <article className="overview-card"><div><span>LAST MATCH</span><h2>Strong at the net</h2><p>Sunday · 1h 24m</p></div><div className="overview-score"><b>74</b><small>shot quality</small></div></article>
          <div className="quick-actions"><button onClick={() => setTab("camera")}><i>＋</i><b>Analyze a match</b><small>Upload a new video</small></button><button onClick={() => setTab("history")}><i>↗</i><b>Match history</b><small>View past results</small></button></div>
          <div className="section-title"><h2>Latest progress</h2><button onClick={() => setTab("stats")}>See insights ›</button></div>
          <article className="white-card progress-card"><div className="progress-top"><span><b>Shot quality</b><small>Last 4 matches</small></span><strong>+8</strong></div><div className="bars">{[52,61,68,74].map((v,i)=><i key={v} style={{height:`${v}%`}}><small>{i+1}</small></i>)}</div></article>
          <article className="white-card next-tip"><i>◎</i><div><b>Next focus</b><p>Keep your lob deeper when defending.</p></div><button>›</button></article>
        </section> : tab === "history" ? <section className="screen app-page">
          <div className="page-title"><div><small>MATCH LIBRARY</small><h1>Your matches</h1></div><button aria-label="Filter matches">☷</button></div>
          <div className="segment three"><button className="active">All</button><button>Ready</button><button>Processing</button></div>
          <div className="match-list">
            {[{date:"9 Aug 2026",name:"Sunday Padel",score:"74",time:"1h 24m",status:"Ready"},{date:"2 Aug 2026",name:"Friendly Match",score:"68",time:"58m",status:"Ready"},{date:"27 Jul 2026",name:"Training Game",score:"61",time:"1h 10m",status:"Ready"}].map(match=><button className="match-card" key={match.date} onClick={() => setTab("stats")}><span className="match-play">▶</span><span><small>{match.date}</small><b>{match.name}</b><em>{match.time} · {match.status}</em></span><strong>{match.score}<small>/100</small></strong><i>›</i></button>)}
          </div>
          <button className="glass-action" onClick={() => setTab("camera")}>＋ Analyze another match</button>
        </section> : tab === "profile" ? <section className="screen app-page">
          <div className="page-title"><div><small>ACCOUNT</small><h1>Your profile</h1></div><button aria-label="Profile settings">⚙</button></div>
          <article className="profile-card"><div className="profile-avatar">TD</div><div><h2>Titho</h2><p>Right-handed · Right side</p></div><button>Edit</button></article>
          <div className="profile-stats"><article><b>12</b><small>Matches</small></article><article><b>9.4h</b><small>Video</small></article><article><b>74</b><small>Best score</small></article></div>
          <article className="white-card settings-list">{[["Player setup","Side, hand, and level"],["Video settings","Quality and privacy"],["Help","Recording and analysis guide"]].map(([title,desc])=><button key={title}><span><b>{title}</b><small>{desc}</small></span><i>›</i></button>)}</article>
          <p className="version-note">Legite demo · Version 0.1</p>
        </section> : tab === "stats" ? <section className="screen results-screen">
          <div className="result-title"><button onClick={() => setTab("history")}>‹</button><div><small>ANALYSIS RESULT</small><h1>Match summary</h1><p>{file?.name ?? "Sunday Padel · 9 Aug 2026"}</p></div><button>↗</button></div>
          <article className="hero-score"><div><span className="card-label">SHOT QUALITY</span><strong>74<small>/100</small></strong><p><b>Up 6 points</b> from your last match</p></div><Ring /></article>
          <div className="stat-pair"><article><span>POINTS WON</span><b>18<small>/32</small></b><div className="mini-track"><i style={{width:"56%"}} /></div><p>Won 56% of all points</p></article><article><span>TOTAL ERRORS</span><b>19</b><div className="error-key"><i/>12 simple mistakes</div><div className="error-key forced"><i/>7 under pressure</div></article></div>
          <article className="white-card shot-card"><div className="card-head"><span><i className="round-icon">⌁</i><b>Shot quality</b></span><button>See all ›</button></div>{shots.map(s => <div className="shot-row" key={s.name}><span><b>{s.name}</b><small>{s.total} shots</small></span><div className="shot-track"><i className={s.color} style={{width:`${s.value}%`}} /></div><strong>{s.value}</strong></div>)}</article>
          <article className="white-card insight"><div className="card-head"><span><i className="round-icon green">↗</i><b>Tip for you</b></span><button>›</button></div><h2>Your cross-court lob is your best defensive shot.</h2><p>It worked 22% better than a straight lob when you were behind the service line.</p><div className="focus"><span>NEXT PRACTICE</span><b>Use the cross-court lob earlier when under pressure.</b></div></article>
          <article className="white-card review"><div className="card-head"><span><i className="round-icon">▶</i><b>Check results</b></span><button>4 to check ›</button></div><div className="review-row"><div className="review-thumb">▶<span>01:08</span></div><span><b>Backhand into the net</b><small>System confidence 76%</small></span><button>Edit</button></div></article>
          <p className="demo-note">These are sample results. They are not calculated from your video yet.</p>
        </section> : <section className="screen upload-screen">
          <div className="page-title"><div><small>VIDEO ANALYSIS</small><h1>Upload a match</h1></div><button aria-label="Help">?</button></div>
          <div className="segment"><button className="active">New video</button><button>Recording tips</button></div>

          <article className={file ? "upload-panel selected" : "upload-panel"}>
            {!file ? <>
              <button className="upload-orb" onClick={() => fileInput.current?.click()} aria-label="Choose a match video">{icon("camera")}</button>
              <h2>Choose your match video</h2><p>Record from behind with the full court in view</p>
              <button className="black-button" onClick={() => fileInput.current?.click()}>Choose video <span>＋</span></button>
              <div className="format-row"><span>MP4 / MOV</span><i /><span>1080p works best</span><i /><span>Up to 2 GB</span></div>
            </> : <>
              <video className="video" src={url} controls playsInline />
              <div className="file-detail"><div className="mini-play">▶</div><span><b>{file.name}</b><small>{(file.size / 1048576).toFixed(1)} MB · Ready</small></span><button onClick={() => fileInput.current?.click()}>Change</button></div>
              {phase === "processing" ? <div className="analysis-progress"><div><b>Checking your match…</b><span>{progress}%</span></div><div className="track"><i style={{width:`${progress}%`}} /></div><small>Finding rallies, shots, and points</small></div> : <button className="black-button wide" onClick={analyze}>Start analysis <span>→</span></button>}
            </>}
            <input ref={fileInput} hidden type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(e:ChangeEvent<HTMLInputElement>) => choose(e.target.files?.[0])}/>
          </article>

          <article className="tip-card"><div className="tip-icon">⌁</div><div><b>For a clearer result</b><p>Place the camera behind the center glass. Keep all four players in view.</p></div><button>›</button></article>
          <div className="privacy-note"><span>✓</span><p><b>Your video stays private.</b><br/>This early version reads it on your device.</p></div>
        </section>}

        <nav className="bottom-nav" aria-label="Main navigation">
          {[{id:"home",label:"Home",ico:"grid"},{id:"stats",label:"Insights",ico:"chart"},{id:"camera",label:"Upload",ico:"camera"},{id:"history",label:"Matches",ico:"history"},{id:"profile",label:"Profile",ico:"user"}].map(item => <button key={item.id} className={`${tab===item.id?"active ":""}${item.id==="camera"?"capture":""}`} onClick={() => setTab(item.id)}><span>{icon(item.ico as "grid")}</span><small>{item.label}</small></button>)}
        </nav>
      </div>
    </main>
  );
}
