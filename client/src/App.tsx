import { useEffect, useRef, useState, type FormEvent } from "react";
import { STARTUP_IDS, STARTING_CAPITAL_CENTS, awardPlaces, skipAwardAnimation, type PublicEventResponse, type SessionResponse, type StartupId } from "@startup-game/shared";
import { ApiClientError, api } from "./api.js";
import { formatMoney, formatMoneyExact } from "./format.js";
import { type MessageKey, translate, useI18n } from "./i18n.js";
import { clearSessionId, readSessionId, saveSessionId } from "./session-recovery.js";
import { BrandIcon, ProductArt, Leaderboard, RoundDecision, RoundResult, SessionFinal, centsToInput, parseDollarInput, initialDraft, zeroDraft, COMPANY_META, type AmountDraft } from "./game-ui.js";
import { Organizer } from "./organizer-ui.js";
type Connection = "checking" | "online" | "offline";
function apiMessage(error: unknown, t: (key: MessageKey, options?: Record<string, string | number>) => string): string {
  if (!(error instanceof ApiClientError)) return t("genericError");
  const keys: Record<string, MessageKey> = { NETWORK_ERROR: "networkError", DUPLICATE_NAME: "duplicateName", SESSION_ALREADY_ACTIVE: "activeSession", INVALID_ORGANIZER_PASSWORD: "badPassword", ORGANIZER_PASSWORD_NOT_CONFIGURED: "passwordNotConfigured", ORGANIZER_AUTH_REQUIRED: "authExpired", VALIDATION_ERROR: "invalidAllocation", EVENT_FINALIZED: "eventWasClosed" };
  return t(keys[error.code] ?? "genericError");
}
function readAwardsSeen(key: string): boolean { try { return localStorage.getItem(`startup-game-awards-${key}`) === "1"; } catch { return false; } }
function markAwardsSeen(key: string): void { try { localStorage.setItem(`startup-game-awards-${key}`, "1"); } catch {} }
function App() {
  const { language, setLanguage, t } = useI18n();
  const [connection, setConnection] = useState<Connection>("checking");
  const [event, setEvent] = useState<PublicEventResponse | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [draft, setDraft] = useState<AmountDraft>(zeroDraft);
  const [name, setName] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [savingDraft, setSavingDraft] = useState(false);
  const autosaveQueue = useRef<Promise<void>>(Promise.resolve());
  const lastSavedDraft = useRef("");
  const organizerDialogRef = useRef<HTMLDialogElement | null>(null);
  const [organizerOpen, setOrganizerOpen] = useState(false);
  const [organizerPassword, setOrganizerPassword] = useState("");
  const [organizerError, setOrganizerError] = useState("");
  const abortDialogRef = useRef<HTMLDialogElement | null>(null);
  const [abortOpen, setAbortOpen] = useState(false);
  const [awardIndex, setAwardIndex] = useState(0);
  const [awardsComplete, setAwardsComplete] = useState(true);
  const [cabinetOpen, setCabinetOpen] = useState(false);
  const [motion, setMotion] = useState(true);
  const awardTimers = useRef<number[]>([]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = language === "ru" ? "Инвестиционная игра" : "Startup Investment Game";
  }, [language]);

  useEffect(() => {
    const dialog = organizerDialogRef.current;
    if (!dialog) return;
    if (organizerOpen && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>("input")?.focus();
    } else if (!organizerOpen && dialog.open) {
      dialog.close();
    }
  }, [organizerOpen]);

  useEffect(() => {
    const dialog = abortDialogRef.current;
    if (!dialog) return;
    if (abortOpen && !dialog.open) {
      dialog.showModal();
    } else if (!abortOpen && dialog.open) {
      dialog.close();
    }
  }, [abortOpen]);

  useEffect(() => {
    for (const timer of awardTimers.current) window.clearTimeout(timer);
    awardTimers.current = [];
    if (!event) return;
    if (event.status === "OPEN") {
      try { localStorage.removeItem("startup-game-awards-shown"); } catch { /* Optional replay preference. */ }
      setAwardsComplete(true);
      setAwardIndex(0);
      return;
    }
    if (readAwardsSeen(event.eventKey)) { setAwardsComplete(true); return; }
    const places = awardPlaces(event.leaderboard);
    setAwardIndex(0);
    if (skipAwardAnimation(places, !motion || window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      markAwardsSeen(event.eventKey);
      setAwardsComplete(true);
      return;
    }
    setAwardsComplete(false);
    places.forEach((_place, index) => {
      if (index === 0) return;
      awardTimers.current.push(window.setTimeout(() => setAwardIndex(index), index * 3_500));
    });
    awardTimers.current.push(window.setTimeout(() => {
      setAwardsComplete(true);
      markAwardsSeen(event.eventKey);
    }, places.length * 3_500));
    return () => {
      for (const timer of awardTimers.current) window.clearTimeout(timer);
      awardTimers.current = [];
    };
  }, [event, motion]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoadState("loading");
    Promise.all([api.health(controller.signal), api.event(controller.signal)])
      .then(async ([health, eventData]) => {
        if (!active) return;
        if (health.status !== "ok") throw new Error("Health response is invalid.");
        setEvent(eventData);
        setConnection("online");
        const id = readSessionId();
        if (!id) {
          setSession(null);
          setLoadState("ready");
          return;
        }
        try {
          const recovered = await api.session(id, controller.signal);
          if (!active) return;
          if (recovered.eventKey !== eventData.eventKey) { clearSessionId(); setSession(null); setLoadState("ready"); return; }
          setSession(recovered);
          setDraft(initialDraft(recovered));
        } catch (sessionError) {
          if (sessionError instanceof ApiClientError && sessionError.status === 404) {
            clearSessionId();
            setSession(null);
          } else if (sessionError instanceof DOMException && sessionError.name === "AbortError") {
            return;
          } else {
            throw sessionError;
          }
        }
        setLoadState("ready");
      })
      .catch((loadError: unknown) => {
        if (!active || (loadError instanceof DOMException && loadError.name === "AbortError")) return;
        setConnection("offline");
        setError(apiMessage(loadError, translate));
        setLoadState("ready");
      });
    return () => { active = false; controller.abort(); };
  }, [retry]);

  useEffect(() => {
    if (busy || !session || !session.status.endsWith("_DECISION") || loadState !== "ready") return;
    const amounts = Object.fromEntries(STARTUP_IDS.map((id) => [id, parseDollarInput(draft[id])])) as Record<StartupId, number | null>;
    if (STARTUP_IDS.some((id) => amounts[id] === null)) return;
    const cleanAmounts = amounts as Record<StartupId, number>;
    const total = STARTUP_IDS.reduce((sum, id) => sum + cleanAmounts[id], 0);
    if (!Number.isSafeInteger(total) || total > session.capitalCents) return;
    const portfolio = { startupAmountsCents: cleanAmounts, cashCents: session.capitalCents - total };
    const key = `${session.id}:${session.currentRound}:${JSON.stringify(portfolio)}`;
    if (lastSavedDraft.current === key) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setSavingDraft(true);
      const pending = autosaveQueue.current.catch(() => undefined).then(async () => {
        await api.updatePortfolio(session.id, portfolio);
        lastSavedDraft.current = key;
      });
      autosaveQueue.current = pending.then(() => undefined).catch(() => undefined);
      pending.then(() => {
        if (active) setSavingDraft(false);
      }).catch((saveError: unknown) => {
        if (active) {
          setSavingDraft(false);
          setError(apiMessage(saveError, t));
        }
      });
    }, 450);
    return () => { active = false; window.clearTimeout(timer); };
  }, [draft, busy, loadState, session?.id, session?.currentRound, session?.capitalCents, session?.status, t]);

  async function refreshEvent() {
    try { setEvent(await api.event()); } catch { /* Preserve the last public leaderboard during a transient error. */ }
  }

  async function startGame(eventObject: FormEvent<HTMLFormElement>) {
    eventObject.preventDefault();
    setError("");
    const cleaned = name.trim().normalize("NFC");
    const length = Array.from(cleaned).length;
    if (length < 2 || length > 24) { setError(t("emptyName")); return; }
    setBusy(true);
    try {
      const created = await api.createSession(cleaned, language);
      saveSessionId(created.id);
      setSession(created);
      setDraft(initialDraft(created));
      setName("");
      await refreshEvent();
    } catch (createError) {
      setError(apiMessage(createError, t));
      if (createError instanceof ApiClientError && createError.code === "EVENT_FINALIZED") await refreshEvent();
    } finally { setBusy(false); }
  }

  async function confirmAllocation(amounts: Record<StartupId, number>, cash: number) {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      await autosaveQueue.current;
      await api.updatePortfolio(session.id, { startupAmountsCents: amounts, cashCents: cash });
      const confirmed = await api.confirmRound(session.id, session.currentRound);
      setSession(confirmed);
    } catch (confirmError) {
      setError(apiMessage(confirmError, t));
      if (confirmError instanceof ApiClientError && confirmError.code === "EVENT_FINALIZED") await refreshEvent();
    } finally { setBusy(false); }
  }

  async function continueAfterResult() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const next = session.currentRound === 3 ? await api.completeSession(session.id) : await api.nextRound(session.id);
      setSession(next);
      setDraft(initialDraft(next));
      if (next.status === "COMPLETED") await refreshEvent();
    } catch (continueError) {
      setError(apiMessage(continueError, t));
    } finally { setBusy(false); }
  }

  function closeOrganizerDialog() {
    setOrganizerOpen(false);
    setOrganizerPassword("");
    setOrganizerError("");
  }

  async function finalizeEvent(eventObject: FormEvent<HTMLFormElement>) {
    eventObject.preventDefault();
    if (!organizerPassword) { setOrganizerError(t("organizerPasswordEmpty")); return; }
    setBusy(true);
    setOrganizerError("");
    try {
      const finalizedEvent = await api.finalizeEvent(organizerPassword);
      setAwardIndex(0);
      setAwardsComplete(false);
      setEvent(finalizedEvent);
      setSession(null);
      clearSessionId();
      closeOrganizerDialog();
    } catch (finalizeError) {
      setOrganizerError(finalizeError instanceof ApiClientError && finalizeError.code === "SESSION_ALREADY_ACTIVE"
        ? t("activeGameBlocksClose")
        : apiMessage(finalizeError, t));
    } finally { setBusy(false); }
  }

  function nextPlayer() {
    clearSessionId();
    setSession(null);
    setDraft(zeroDraft());
    setName("");
    setError("");
    void refreshEvent();
  }

  async function handleAbortGame() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      await autosaveQueue.current;
      await api.abortSession(session.id);
      clearSessionId();
      setSession(null);
      setDraft(zeroDraft());
      setName("");
      setAbortOpen(false);
      void refreshEvent();
    } catch (abortError) {
      setError(apiMessage(abortError, t));
      setAbortOpen(false);
    } finally {
      setBusy(false);
    }
  }

  const status = connection === "checking" ? t("checking") : connection === "online" ? t("online") : t("offline");
  const finalized = event?.status === "FINALIZED";
  const showStart = !session;
  const currentAwardPlace = event?.status === "FINALIZED" ? awardPlaces(event.leaderboard)[awardIndex] : undefined;

  function skipAwards() {
    for (const timer of awardTimers.current) window.clearTimeout(timer);
    awardTimers.current = [];
    if (event) markAwardsSeen(event.eventKey);
    setAwardsComplete(true);
  }


  useEffect(() => { document.documentElement.dataset.motion = motion ? "on" : "off"; }, [motion]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); setSavingDraft(false); }, [session?.status]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [event?.status, awardIndex, awardsComplete]);
  function replayAwards() { if (!event) return; try { localStorage.removeItem(`startup-game-awards-${event.eventKey}`); } catch {} setEvent({ ...event }); }
  function acceptOrganizerEvent(e: PublicEventResponse) { if (e.eventKey !== event?.eventKey) { clearSessionId(); setSession(null); setError(""); } setEvent(e); }
  return <div className="page-shell">
    <header className="topbar"><a className="brand" href="/" aria-label={t("home")}><span className="brand-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17 10 6l4 7 6-10M5 21h15"/></svg></span><span>Startup <b>Arena</b></span></a>{event?.title&&event.title!=="Startup Arena"&&<span className="event-chip">{event.title}</span>}<div className="topbar-actions"><div className={`connection connection-${connection}`} role="status"><i/>{status}</div>{connection==="offline"&&<button className="quiet-button" onClick={()=>setRetry(v=>v+1)}>{t("retry")}</button>}<button className="quiet-button motion-switch" aria-pressed={motion} onClick={()=>setMotion(v=>!v)}>{t("motion")}: {t(motion?"motionOn":"motionOff")}</button><div className="language-switch" role="group" aria-label={t("interfaceLanguage")}>{(["ru","en"] as const).map(l=><button key={l} className={language===l?"is-active":""} aria-pressed={language===l} onClick={()=>setLanguage(l)}>{l.toUpperCase()}</button>)}</div>{session&&session.status!=="COMPLETED"&&<button className="quiet-button abort-button" onClick={()=>setAbortOpen(true)}>{t("abortGame")}</button>}{!session&&<button className="quiet-button" onClick={()=>setCabinetOpen(true)}>{t("cabinet")}</button>}</div></header>
    {loadState==="loading"?<main className="app-content loading-view" role="status">{t("eventLoading")}</main>:!event?<main className="app-content error-view"><h1>{t("eventError")}</h1><button className="primary-button" onClick={()=>setRetry(v=>v+1)}>{t("retry")}</button></main>:finalized?<main className="app-content awards-page">{!awardsComplete&&currentAwardPlace!==undefined?<section className={`award-card award-card--place-${currentAwardPlace}`} key={currentAwardPlace}><div className="award-medallion"><span>{currentAwardPlace}</span></div><h1>{t(currentAwardPlace===1?"awardsFirst":currentAwardPlace===2?"awardsSecond":"awardsThird")}</h1><div className="award-winners">{event.leaderboard.filter(p=>p.place===currentAwardPlace).map((p,i)=><div className="award-winner" key={i}><strong>{p.name}</strong><span>{formatMoneyExact(p.finalCapitalCents,language)}</span></div>)}</div>{currentAwardPlace===1&&<div className="confetti" aria-hidden="true">{Array.from({length:40},(_,i)=><i key={i} style={{left:`${(i*37)%100}%`,animationDelay:`${(i%7)*.11}s`,background:["#b88c36","#6458c7","#5676c0","#e8b95c"][i%4],transform:`rotate(${i*31}deg)`}}/>)}</div>}<button className="secondary-button" onClick={skipAwards}>{t("skipAwards")}</button></section>:<><div className="closed-final-heading"><h1>{t("fullRanking")}</h1><p className="page-lead">{t("eventFinal")}</p></div><div className="podium-grid">{event.leaderboard.filter(p=>p.place<=3).map((p,i)=><article key={i} className={`podium-card podium-place-${p.place}`}><span>{String(p.place).padStart(2,"0")}</span><h2>{p.name}</h2><strong>{formatMoneyExact(p.finalCapitalCents,language)}</strong></article>)}</div><Leaderboard event={event}/><button className="secondary-button" onClick={replayAwards}>{t("replay")}</button></>}</main>:showStart?<main className="app-content start-page"><section className="start-intro"><div className="start-copy"><h1>{t("startTitle")}</h1><p className="page-lead">{t("startLead")}</p><div className="start-facts"><div><strong>1000 <small>$</small></strong><span>{t("yourStart")}</span></div><div><strong>3</strong><span>{t("rounds")}</span></div><div><strong>{event.startupIds.length}</strong><span>{t("startups")}</span></div></div><form className="start-form" onSubmit={startGame}><label htmlFor="player-name">{t("playerName")}</label><div><input id="player-name" autoComplete="off" value={name} onChange={e=>setName(e.target.value)} placeholder={t("namePlaceholder")} aria-describedby="name-hint"/><button className="primary-button" disabled={busy}>{t(busy?"starting":"start")} →</button></div><small id="name-hint">{t("nameHint")}</small>{error&&<p className="inline-error" role="alert">{error}</p>}</form><div className="start-steps">{[event.startupIds.length===4?"legacyRead":"stepRead","stepAllocate","stepDiscover"].map((key,i)=><span key={key}><b>{i+1}</b>{t(key as MessageKey)}</span>)}</div></div><div className="universe-panel"><div className="universe-heading"><h2>{t("viewMarket")}</h2></div><div className="universe-grid">{event.startupIds.map(id=><article key={id} className="universe-card"><ProductArt id={id}/><div><BrandIcon id={id} size={30}/><span><strong>{id}</strong><small>{t(COMPANY_META[id].sector)}</small></span></div></article>)}</div></div></section>{event.startupIds.length===4&&<p className="model-note">{t("legacyEvent")}</p>}<Leaderboard event={event}/><button className="quiet-button organizer-button" onClick={()=>setOrganizerOpen(true)}>{t("organizer")}</button></main>:session?.status==="COMPLETED"?<SessionFinal session={session} onNext={nextPlayer}/>:session?.status.endsWith("_DECISION")?<RoundDecision key={`${session.id}:${session.currentRound}`} session={session} draft={draft} setDraft={setDraft} busy={busy} error={error} savingDraft={savingDraft} onConfirm={confirmAllocation}/>:session?<RoundResult session={session} busy={busy} error={error} onContinue={continueAfterResult}/>:null}
    <footer className="page-footer"><span>Startup Arena</span><span>{t("educational")}</span></footer>
    {cabinetOpen&&<Organizer onClose={()=>setCabinetOpen(false)} onEvent={acceptOrganizerEvent} onReplay={replayAwards} onFinalize={()=>setOrganizerOpen(true)}/>}
    <dialog ref={organizerDialogRef} className="organizer-dialog" onCancel={closeOrganizerDialog} aria-labelledby="close-event-title"><div className="dialog-content"><h2 id="close-event-title">{t("organizerDialogTitle")}</h2><p className="page-lead">{t("organizerDialogCopy")}</p><form onSubmit={finalizeEvent}><label htmlFor="finalize-password">{t("organizerPassword")}</label><input id="finalize-password" type="password" autoComplete="off" value={organizerPassword} onChange={e=>setOrganizerPassword(e.target.value)}/>{organizerError&&<p className="inline-error" role="alert">{organizerError}</p>}<div className="dialog-actions"><button className="secondary-button" type="button" disabled={busy} onClick={closeOrganizerDialog}>{t("cancel")}</button><button className="primary-button" disabled={busy}>{t(busy?"closingEvent":"confirm")}</button></div></form></div></dialog>
    <dialog ref={abortDialogRef} className="organizer-dialog abort-dialog" onCancel={()=>setAbortOpen(false)} aria-labelledby="abort-dialog-title"><div className="dialog-content"><h2 id="abort-dialog-title">{t("abortConfirmTitle")}</h2><p className="page-lead">{t("abortConfirmCopy")}</p><div className="dialog-actions"><button className="secondary-button" type="button" disabled={busy} onClick={()=>setAbortOpen(false)}>{t("abortKeepPlaying")}</button><button className="primary-button danger-button" type="button" disabled={busy} onClick={handleAbortGame}>{t("abortConfirmAction")}</button></div></div></dialog>
  </div>;
}
export default App;
