import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark, Check, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, FileDown,
  Link2, Loader2, Pencil, Printer, RefreshCw, Save, Sparkles, Target, MessageSquare,
  FileText, Zap, Tag, X
} from "lucide-react";
import type { RecapDetail, RecapFormat, RecapPeriod, RecapSourceItem, RecapTheme } from "../../shared/types";
import type { useRecapWorkspace } from "../app/useRecapWorkspace";
import appIcon from "../assets/app-icon.png";
import { formatReconDuration } from "../domain/reconstruct";
import {
  recapCoverageNote,
  recapFormatMeta,
  recapLineText,
  recapSourceRef,
  recapTitle,
  recapToMarkdown,
  recapToPlainText,
  visibleRecapLines,
  visibleRecapParagraphs
} from "../domain/recapWorkspace";

type Workspace = ReturnType<typeof useRecapWorkspace>;
interface RecapViewProps { workspace: Workspace; onOpenCalendar: () => void; }

const FORMATS: Array<{ id: RecapFormat; Icon: typeof Target }> = [
  { id: "perf", Icon: Target }, { id: "manager", Icon: MessageSquare }, { id: "cv", Icon: FileText },
  { id: "standup", Icon: Zap }, { id: "changelog", Icon: Tag }
];
const DETAILS: RecapDetail[] = ["headline", "balanced", "detailed"];
const DETAIL_LABELS: Record<RecapDetail, string> = { headline: "Brief", balanced: "Standard", detailed: "Detailed" };

const EmphasizedText = ({ text, emphasis }: { text: string; emphasis?: string }) => {
  if (!emphasis || !text.includes(emphasis)) return <>{text}</>;
  const index = text.indexOf(emphasis);
  return <>{text.slice(0, index)}<strong>{emphasis}</strong>{text.slice(index + emphasis.length)}</>;
};

const ThemeBlock = ({ theme, format, detail, readOnly, sourceRefs, onSources, onUpdate }: {
  theme: RecapTheme; format: RecapFormat; detail: RecapDetail; readOnly: boolean;
  sourceRefs: string[]; onSources: () => void; onUpdate: (theme: RecapTheme) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(theme);
  const [impactLineId, setImpactLineId] = useState<string>();
  const [impactDraft, setImpactDraft] = useState("");
  useEffect(() => { setDraft(theme); setImpactLineId(undefined); }, [theme]);
  const copy = editing ? draft.copy[format] : theme.copy[format];
  const paragraphs = visibleRecapParagraphs(copy, detail);
  const visible = visibleRecapLines(copy, detail, format);
  const saveEdit = () => { onUpdate(draft); setEditing(false); };
  const updateLead = (value: string) => setDraft((current) => ({ ...current, copy: { ...current.copy,
    [format]: { ...current.copy[format], [format === "changelog" ? "version" : "lead"]: value } } }));
  const updateLine = (id: string, value: string) => setDraft((current) => ({ ...current, copy: { ...current.copy,
    [format]: { ...current.copy[format], lines: current.copy[format].lines.map((line) => line.id === id
      ? { ...line, [detail === "detailed" ? "long" : "short"]: value } : line) } } }));
  const updateParagraph = (id: string, value: string) => setDraft((current) => ({ ...current, copy: { ...current.copy,
    [format]: { ...current.copy[format], paragraphs: (current.copy[format].paragraphs ?? []).map((paragraph) => paragraph.id === id
      ? { ...paragraph, text: value } : paragraph) } } }));
  const openImpact = (lineId: string, value?: string) => { setImpactLineId(lineId); setImpactDraft(value ?? ""); };
  const saveImpact = (lineId: string) => {
    const userImpact = impactDraft.trim();
    if (!userImpact) return;
    onUpdate({ ...theme, copy: { ...theme.copy, cv: { ...theme.copy.cv,
      lines: theme.copy.cv.lines.map((line) => line.id === lineId ? { ...line, needsImpact: false, userImpact } : line)
    } } });
    setImpactLineId(undefined);
    setImpactDraft("");
  };
  const removeImpact = (lineId: string) => {
    onUpdate({ ...theme, copy: { ...theme.copy, cv: { ...theme.copy.cv,
      lines: theme.copy.cv.lines.map((line) => line.id === lineId ? { ...line, needsImpact: true, userImpact: undefined } : line)
    } } });
    setImpactLineId(undefined);
    setImpactDraft("");
  };
  return <article className={`recap-theme is-${theme.colorToken}`}>
    <header className="recap-theme-head">
      <span className="recap-theme-chip" />
      {editing ? <input className="recap-edit-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        : <h2>{theme.name}</h2>}
      <span className="recap-theme-metric">{theme.pullRequestCount} PRs · {theme.ticketCount} tickets · {formatReconDuration(theme.hours * 60)}</span>
      <button type="button" className="recap-source-btn" onClick={onSources}><Link2 size={12} /> Sources</button>
      {!readOnly && <button type="button" className="recap-icon-btn" aria-label={editing ? "Cancel editing" : `Edit ${theme.name}`}
        onClick={() => { setDraft(theme); setEditing((value) => !value); }}>{editing ? <X size={14} /> : <Pencil size={14} />}</button>}
    </header>
    <div className="recap-theme-body">
      {(copy.lead || copy.version) && (editing
        ? <textarea className="recap-edit-lead" value={copy.version ?? copy.lead ?? ""} onChange={(event) => updateLead(event.target.value)} />
        : format === "changelog" ? <span className="recap-version-tag">{copy.version}</span> : <strong className="recap-theme-lead">{copy.lead}</strong>)}
      {paragraphs.length > 0 && <div className="recap-narrative">{paragraphs.map((paragraph) => editing
        ? <textarea key={paragraph.id} value={paragraph.text} onChange={(event) => updateParagraph(paragraph.id, event.target.value)} />
        : <p key={paragraph.id}>{paragraph.text}</p>)}</div>}
      {(format === "perf" || format === "manager") && visible.length > 0 && <div className="recap-evidence-label">Evidence highlights</div>}
      <div className="recap-lines">
        {visible.map((line) => <div className="recap-line-wrap" key={line.id}><div className="recap-line">
          {format === "changelog" && line.tag ? <span className={`recap-change-tag is-${line.tag.toLowerCase()}`}>{line.tag}</span>
            : <span className="recap-line-dot" />}
          {editing ? <textarea value={detail === "detailed" ? line.long : line.short} onChange={(event) => updateLine(line.id, event.target.value)} />
            : <p><EmphasizedText text={recapLineText(line, detail, format)} emphasis={line.emphasis} /> {detail === "detailed" && format !== "cv" && format !== "standup" && line.refs.map((ref) => <code key={ref}>{ref}</code>)}
              {format === "cv" && !readOnly && <button type="button" className={`recap-impact-needed ${line.userImpact ? "is-complete" : ""}`} aria-expanded={impactLineId === line.id}
                onClick={() => openImpact(line.id, line.userImpact)}>{line.userImpact ? "Edit outcome" : "Add outcome"}</button>}
              {format === "cv" && readOnly && line.needsImpact && <span className="recap-impact-needed">Outcome needed</span>}</p>}
        </div>{format === "cv" && !editing && !readOnly && impactLineId === line.id && <form className="recap-impact-editor" onSubmit={(event) => { event.preventDefault(); saveImpact(line.id); }}>
          <label htmlFor={`impact-${line.id}`}>What changed because of this work?</label>
          <p>Describe an observed result, who benefited, or a measure you can stand behind.</p>
          <textarea id={`impact-${line.id}`} autoFocus value={impactDraft} onChange={(event) => setImpactDraft(event.target.value)} placeholder="Describe the result you observed" />
          <small>Examples: unblocked a release, reduced a recurring task, helped another team adopt the flow.</small>
          <div>{line.userImpact && <button type="button" onClick={() => removeImpact(line.id)}>Remove outcome</button>}<button type="button" onClick={() => setImpactLineId(undefined)}>Cancel</button><button type="submit" className="is-primary" disabled={!impactDraft.trim()}><Check size={13} /> Save outcome</button></div>
        </form>}</div>)}
      </div>
      {format === "perf" && detail === "detailed" && <footer className="recap-theme-sources"><span>SOURCES</span>{sourceRefs.slice(0, 3).map((ref) => <code key={ref}>{ref}</code>)}</footer>}
      {editing && <div className="recap-edit-actions"><button type="button" onClick={() => setEditing(false)}>Cancel</button><button type="button" className="is-primary" onClick={saveEdit}><Check size={13} /> Apply edits</button></div>}
    </div>
  </article>;
};

const SourceDrawer = ({ theme, sources, onClose, onOpenCalendar }: { theme: RecapTheme; sources: RecapSourceItem[]; onClose: () => void; onOpenCalendar: () => void }) => {
  const drawerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(drawerRef.current?.querySelectorAll<HTMLElement>("button,a[href]") ?? []);
    focusable()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); previous?.focus(); };
  }, [onClose]);
  const groups = [
    ["Tickets", sources.filter((item) => item.kind === "ticket")],
    ["Pull requests & commits", sources.filter((item) => item.kind === "pull-request" || item.kind === "commit")],
    ["Meetings & local work", sources.filter((item) => item.kind === "meeting" || item.kind === "local")]
  ] as const;
  return <><button className="recap-scrim" aria-label="Close sources" onClick={onClose} />
    <aside ref={drawerRef} className="recap-source-drawer" role="dialog" aria-modal="true" aria-label={`${theme.name} sources`}>
      <header><span className={`recap-theme-chip is-${theme.colorToken}`} /><h2>{theme.name}</h2><button className="recap-icon-btn" onClick={onClose} aria-label="Close sources"><X size={16} /></button>
        <div className="recap-source-summary"><strong>{formatReconDuration(theme.hours * 60)}</strong><span>time reconstructed</span><p>Every line is grounded in the items below. Nothing is invented.</p></div>
        <button type="button" className="recap-calendar-link" onClick={onOpenCalendar}>Open interval in the calendar →</button>
      </header>
      <div className="recap-source-list">{groups.map(([label, items]) => items.length ? <section key={label}><h3>{label} <span>{items.length}</span></h3>{items.map((item) => {
        const url = item.issueUrl ?? item.pullRequestUrl;
        const row = <><span className="recap-source-key">{item.issueKey ?? (item.pullRequestId ? `#${item.pullRequestId}` : item.kind)}</span><span className="recap-source-title">{item.title}</span>{item.repository && <small>{item.repository}</small>}{item.role && <small>{item.role}</small>}<strong>{formatReconDuration(item.timeSpentSeconds / 60)}</strong>{url && <ExternalLink size={13} />}</>;
        return url ? <a href={url} target="_blank" rel="noreferrer" className="recap-source-row" key={item.id}>{row}</a> : <div className="recap-source-row" key={item.id}>{row}</div>;
      })}</section> : null)}</div>
      <footer>These feed the “{theme.name}” section of your recap.</footer>
    </aside></>;
};

export const RecapView = ({ workspace: ws, onOpenCalendar }: RecapViewProps) => {
  const [sourceThemeId, setSourceThemeId] = useState<string>();
  const [exportOpen, setExportOpen] = useState(false);
  const [historyOnly, setHistoryOnly] = useState(false);
  const [bragOpen, setBragOpen] = useState(false);
  const draft = ws.displayedDraft;
  const sourceTheme = draft?.themes.find((theme) => theme.id === sourceThemeId);
  const sourceItems = sourceTheme ? draft?.sources.filter((source) => sourceTheme.sourceIds.includes(source.id)) ?? [] : [];
  const meta = recapFormatMeta[ws.format];
  const exportText = (markdown: boolean) => draft ? (markdown ? recapToMarkdown(draft, ws.format, ws.detail) : recapToPlainText(draft, ws.format, ws.detail)) : "";
  const copy = async () => { await navigator.clipboard.writeText(exportText(false)); setExportOpen(false); };
  const download = () => { if (!draft) return; const url = URL.createObjectURL(new Blob([exportText(true)], { type: "text/markdown;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `timebro-recap-${draft.interval.key.replace(":", "-")}-v${draft.version}.md`; link.click(); URL.revokeObjectURL(url); setExportOpen(false); };
  const print = () => { document.body.classList.add("recap-printing"); setExportOpen(false); window.setTimeout(() => { window.print(); document.body.classList.remove("recap-printing"); }, 20); };
  const grounding = draft ? `Bro read ${draft.coverage.pullRequestCount} PRs, ${draft.coverage.commitCount} commits and ${draft.coverage.ticketCount} tickets to draft this.` : "Building from local evidence…";
  const coverageNote = draft ? recapCoverageNote(draft) : undefined;
  const currentFormatEnhanced = Boolean(draft && (
    draft.aiFormats?.includes(ws.format) || (draft.generator === "ai" && !draft.aiFormats)
  ));

  return <div className="view recap-workspace">
    <header className="recap-topbar"><span className="recap-title-icon"><Sparkles size={18} /></span><div><h1>Recap</h1><p>Turn a stretch of real work into review-ready highlights</p></div>
      <div className="recap-top-actions"><button type="button" className="recap-secondary recap-brag-toggle" onClick={() => setBragOpen(true)} aria-expanded={bragOpen}><Bookmark size={14} /> Brag doc</button><div className="recap-export-wrap"><button type="button" className="recap-secondary" onClick={() => setExportOpen((value) => !value)} disabled={!draft}><Download size={14} /> Export</button>{exportOpen && <div className="recap-export-menu"><button onClick={copy}><Copy size={14} /> Copy text</button><button onClick={download}><FileDown size={14} /> Download Markdown</button><button onClick={print}><Printer size={14} /> Print / Save PDF</button></div>}</div>
        {ws.selectedSaved ? <button className="recap-primary" onClick={ws.duplicateSaved} disabled={ws.isLoading || ws.record?.intervalKey !== ws.selectedSaved.version.interval.key}><Copy size={14} /> Duplicate as draft</button> : <button className="recap-primary" onClick={ws.saveCurrent} disabled={!draft || ws.isGenerating}><Save size={14} /> Save to brag doc</button>}</div>
    </header>
    <div className="recap-layout">
      <aside className="recap-controls">
        <section><h2>Format</h2><div className="recap-format-list">{FORMATS.map(({ id, Icon }) => <button key={id} className={ws.format === id ? "active" : ""} onClick={() => ws.setFormat(id)} disabled={Boolean(ws.selectedSaved)}><Icon size={15} /><span>{recapFormatMeta[id].label}</span>{ws.format === id && <Check size={14} />}</button>)}</div></section>
        <hr /><section><h2>Period</h2><div className="recap-segments">{(["week", "month", "quarter"] as RecapPeriod[]).map((id) => <button key={id} className={ws.period === id ? "active" : ""} onClick={() => ws.setPeriod(id)} disabled={Boolean(ws.selectedSaved)}>{id}</button>)}</div>
          <div className="recap-stepper"><button onClick={() => ws.stepInterval(-1)} disabled={Boolean(ws.selectedSaved)}><ChevronLeft size={14} /></button><span>{ws.interval.label}</span><button onClick={() => ws.stepInterval(1)} disabled={!ws.canStepNext || Boolean(ws.selectedSaved)}><ChevronRight size={14} /></button></div>
          {draft && <p className="recap-coverage">{draft.coverage.jiraWeeks}/{draft.coverage.elapsedWeeks ?? draft.coverage.requestedWeeks} elapsed Jira weeks · {draft.coverage.bitbucketWeeks} Bitbucket weeks</p>}</section>
        <section><h2>Length</h2><input type="range" min="0" max="2" step="1" value={DETAILS.indexOf(ws.detail)} aria-label="Recap detail" onChange={(event) => ws.setDetail(DETAILS[Number(event.target.value)])} disabled={Boolean(ws.selectedSaved)} /><div className="recap-detail-buttons">{DETAILS.map((id) => <button key={id} className={ws.detail === id ? "active" : ""} onClick={() => ws.setDetail(id)} disabled={Boolean(ws.selectedSaved)}>{DETAIL_LABELS[id]}</button>)}</div></section>
        <hr /><section><h2>Writing style</h2><div className="recap-voice"><span>{meta.voice}</span><small>Format preset</small></div></section>
        <div className="recap-grounding"><img src={appIcon} alt="" /><p>{grounding}</p></div>
      </aside>
      <main className={`recap-document ${ws.isGenerating ? "is-generating" : ""}`}>
        {ws.isLoading ? <div className="recap-empty"><Loader2 className="spin" /><h2>Reading local history…</h2></div> : !draft?.themes.length ? <div className="recap-empty"><Sparkles size={30} /><h2>No reconstructed work in {ws.interval.shortLabel}</h2><p>Recap only reads weeks already cached in TimeBro. Open the calendar and sync the weeks you want to include.</p><button className="recap-secondary" onClick={onOpenCalendar}>Open calendar</button></div> : <>
          {coverageNote && <div className={`recap-coverage-warning is-${draft.coverage.status ?? "partial"}`}><div><strong>Partial history</strong><p>{coverageNote}</p></div><button type="button" onClick={onOpenCalendar}>Review cached weeks</button></div>}
          <div className="recap-doc-eyebrow">{meta.eyebrow} · {draft.interval.label}</div><h1>{recapTitle(ws.format, draft.interval, draft.themes, draft.coverage)}</h1><p className="recap-doc-sub">{meta.sub}</p>
          <div className="recap-generation-row" aria-busy={ws.isGenerating}>{!ws.selectedSaved && <><button className="recap-secondary" onClick={ws.refreshActivity} disabled={ws.isGenerating} title="Rebuild from cached Jira, Bitbucket and local activity">{ws.isRefreshing ? <Loader2 className="spin" size={13} /> : <RefreshCw size={13} />} {ws.isRefreshing ? "Refreshing activity" : `Refresh activity${ws.newEvidenceCount ? ` (${ws.newEvidenceCount})` : ""}`}</button>
            {ws.canEnhanceWithAi && <button className="recap-secondary recap-ai-action" onClick={ws.rewriteWithAi} disabled={ws.isGenerating}><Sparkles className={ws.isRewriting ? "spin" : ""} size={13} /> {ws.isRewriting ? "Writing new version" : "Rewrite with AI"}</button>}</>}
            {!ws.selectedSaved && ws.record && <select aria-label="Draft version" value={ws.record.activeVersion} onChange={(event) => ws.setActiveVersion(Number(event.target.value))}>{ws.record.versions.map((version) => <option key={version.version} value={version.version}>Version {version.version}</option>)}</select>}
            <span>{ws.selectedSaved ? `Saved ${new Date(ws.selectedSaved.savedAt).toLocaleDateString()}` : ws.isRefreshing ? "Rebuilding from cached activity" : ws.isRewriting ? "Creating a separate AI version" : `${currentFormatEnhanced ? "AI-assisted" : "Local"} ${meta.label.toLowerCase()} · ${draft.editedAt ? "edited" : "not yet saved"}`}</span>
          </div>
          {draft.themes.map((theme) => <ThemeBlock key={theme.id} theme={theme} format={ws.format} detail={ws.detail} readOnly={Boolean(ws.selectedSaved)} sourceRefs={draft.sources.filter((source) => theme.sourceIds.includes(source.id)).map(recapSourceRef)} onSources={() => setSourceThemeId(theme.id)} onUpdate={(next) => ws.updateTheme(theme.id, () => next)} />)}
        </>}
      </main>
      {bragOpen && <button type="button" className="recap-brag-scrim" aria-label="Close brag doc" onClick={() => setBragOpen(false)} />}
      <aside className={`recap-brag ${bragOpen ? "is-open" : ""}`}><header><Bookmark size={16} /><h2>Brag doc</h2><span>{ws.saved.length} saved</span><button type="button" className="recap-icon-btn recap-brag-close" onClick={() => setBragOpen(false)} aria-label="Close brag doc"><X size={14} /></button><p>Every recap stays here for review season. Your promotion material remains ready.</p></header><div className="recap-brag-list">
        {!historyOnly && draft && !ws.selectedSaved && <button className="recap-draft-card"><div><code>{draft.interval.shortLabel}</code><strong>{meta.label}</strong><span>DRAFT</span></div><p><i className="recap-saved-dots">{draft.themes.map((theme) => <b key={theme.id} className={`is-${theme.colorToken}`} />)}</i>{draft.themes.length} focus {draft.themes.length === 1 ? "area" : "areas"} · editing now</p></button>}
        {ws.saved.length ? ws.saved.map((item) => <button key={item.id} className={`recap-saved-card ${ws.selectedSaved?.id === item.id ? "active" : ""}`} onClick={() => { ws.selectSaved(item.id); setBragOpen(false); }}><div><code>{item.version.interval.shortLabel}</code><strong>{recapFormatMeta[item.format].label}</strong><time>{new Date(item.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time></div><p><i className="recap-saved-dots">{item.version.themes.map((theme) => <b key={theme.id} className={`is-${theme.colorToken}`} />)}</i>{item.version.themes.length} focus areas · v{item.version.version}</p></button>) : <div className="recap-brag-empty">Saved recaps will collect here.</div>}
      </div><footer><span>{ws.saved.length ? `${ws.saved.length} local recaps` : "Nothing saved yet"}</span><button onClick={() => setHistoryOnly((value) => !value)}>{historyOnly ? "Back to draft" : "View all →"}</button></footer></aside>
    </div>
    {sourceTheme && <SourceDrawer theme={sourceTheme} sources={sourceItems} onClose={() => setSourceThemeId(undefined)} onOpenCalendar={onOpenCalendar} />}
  </div>;
};
