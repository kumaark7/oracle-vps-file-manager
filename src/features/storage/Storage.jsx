import { Database, Home, Loader2, RefreshCcw } from "lucide-react";
import { CommandButton } from "../../components/Buttons.jsx";
import { formatCompactBytes } from "../files/fileUtils.js";

export function Storage({ server, storage, onRefresh, onHome }) {
  return (
    <section className="min-w-0 rounded-lg border border-slate-800 bg-slate-900 p-4 sm:p-5">
      <div className="mb-5 flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm text-slate-400">{server?.name || "Storage"}</p><h2 className="text-2xl font-bold">Project usage dashboard</h2></div>
        <div className="flex gap-2"><CommandButton icon={RefreshCcw} label="Refresh" onClick={onRefresh} /><CommandButton icon={Home} label="Home" onClick={onHome} /></div>
      </div>
      <StorageContent storage={storage} />
    </section>
  );
}

function StorageContent({ storage }) {
  if (!storage) return <div className="flex h-64 items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" size={18} />Loading storage</div>;
  const categoryTotal = Object.values(storage.categories || {}).reduce((sum, value) => sum + value, 0);
  const totalSpace = storage.totalSpace || 0;
  const usedSpace = storage.usedSpace || 0;
  const freeSpace = Math.max(0, totalSpace - usedSpace);
  const otherDiskUsage = Math.max(0, usedSpace - categoryTotal);
  const cards = [
    { name: "Documents", key: "documents", tone: "sky" }, { name: "Images", key: "images", tone: "emerald" },
    { name: "Videos", key: "videos", tone: "amber" }, { name: "Others", key: "others", tone: "rose" }
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => <article key={card.key} className={`storage-card storage-card--${card.tone}`}><div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-700">{card.name}</p><Database size={16} className="text-slate-500" /></div><p className="mt-4 text-3xl font-bold text-slate-950">{formatCompactBytes(storage.categories?.[card.key] || 0)}</p><p className="mt-3 text-xs text-slate-500">Inside {storage.projects?.length || 0} top-level items</p></article>)}
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-5 text-slate-900">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold text-slate-500">Flow usage</p><h3 className="mt-1 text-2xl font-bold">Using {formatCompactBytes(usedSpace)} of {formatCompactBytes(totalSpace)}</h3></div><p className="text-sm text-slate-500">Free space {formatCompactBytes(freeSpace)}</p></div>
        <div className="mt-4 overflow-hidden rounded-full bg-slate-100"><div className="flex h-4 w-full"><Segment value={storage.categories?.documents || 0} total={totalSpace} className="bg-sky-500" /><Segment value={storage.categories?.images || 0} total={totalSpace} className="bg-emerald-500" /><Segment value={storage.categories?.videos || 0} total={totalSpace} className="bg-amber-400" /><Segment value={storage.categories?.others || 0} total={totalSpace} className="bg-rose-500" /><Segment value={otherDiskUsage} total={totalSpace} className="bg-slate-500" /><Segment value={freeSpace} total={totalSpace} className="bg-slate-200" /></div></div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600"><Legend color="bg-sky-500" label={`Documents (${formatCompactBytes(storage.categories?.documents || 0)})`} /><Legend color="bg-emerald-500" label={`Images (${formatCompactBytes(storage.categories?.images || 0)})`} /><Legend color="bg-amber-400" label={`Videos (${formatCompactBytes(storage.categories?.videos || 0)})`} /><Legend color="bg-rose-500" label={`Others (${formatCompactBytes(storage.categories?.others || 0)})`} />{otherDiskUsage > 0 && <Legend color="bg-slate-500" label={`Outside protected root (${formatCompactBytes(otherDiskUsage)})`} />}<Legend color="bg-slate-300" label={`Free (${formatCompactBytes(freeSpace)})`} /></div>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 text-slate-900">
        <p className="text-sm font-semibold text-slate-500">Projects and folders</p><h3 className="mt-1 text-2xl font-bold">Largest items in this root</h3>
        <div className="mt-4 space-y-3">{storage.topProjects?.length ? storage.topProjects.map((project) => <div key={project.path} className="rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="truncate text-base font-semibold text-slate-900">{project.name}</p><p className="truncate text-xs text-slate-500">{project.path}</p></div><div className="shrink-0 rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white">{formatCompactBytes(project.size)}</div></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-slate-900" style={{ width: `${Math.min(100, categoryTotal ? (project.size / categoryTotal) * 100 : 0)}%` }} /></div></div>) : <p className="text-sm text-slate-500">No project usage found.</p>}</div>
      </section>
    </div>
  );
}

function Segment({ value, total, className }) { return <div className={className} style={{ width: total > 0 ? `${(value / total) * 100}%` : "0%" }} />; }
function Legend({ color, label }) { return <div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${color}`} /><span>{label}</span></div>; }
