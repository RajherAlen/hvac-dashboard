import type { ClientWithSites, SiteWithDevices, WorkLogWithEmployee, WorkOrderKind } from '../types';
import { KIND_LABEL } from './orders';
import { OFFICE_LOCATION, siteAddress } from './clients';

/** Vrsta posla ili 'none' = unos rada bez naloga. */
export type KindKey = WorkOrderKind | 'none';
export const KIND_KEYS: KindKey[] = ['servis', 'montaza', 'popravak', 'dijagnostika', 'ostalo', 'none'];
export const KIND_KEY_LABEL: Record<KindKey, string> = { ...KIND_LABEL, none: 'Bez naloga' };

export type GroupBy = 'client' | 'site' | 'order';

export interface OrderRef {
  id: string;
  title: string;
  kind: WorkOrderKind;
  price?: number | null;
  site_id: string | null;
}

/** Unos rada s nalogom (preko dodjele), ako ga ima. */
export type BreakdownLog = WorkLogWithEmployee & { order: OrderRef | null };

/** Planirani sati iz rasporeda (dodjela s nalogom). */
export interface PlanItem {
  employee_id: string;
  planned_hours: number;
  order: OrderRef;
}

export interface BreakdownNode {
  key: string;
  label: string;
  /** Drugi red: adresa, klijent ili vrsta posla. */
  sublabel?: string;
  /** Vrsta posla – samo na razini naloga. */
  kind?: KindKey;
  hours: number;
  plan: number;
  /** Vrijednost (€) sati u razdoblju, pro-rata po €/h naloga. */
  value: number;
  /** Sati koji imaju cijenu (nazivnik za €/h). */
  pricedHours: number;
  /** Sati na nalozima bez upisane cijene. */
  unpricedHours: number;
  byKind: Record<KindKey, number>;
  logs: BreakdownLog[];
  children?: BreakdownNode[];
}

export interface Breakdown {
  total: BreakdownNode;
  rows: BreakdownNode[];
}

type SiteIndex = Map<string, { site: SiteWithDevices; client: ClientWithSites }>;

/** €/h čvora; null ako nema sati s cijenom. */
export function nodeRate(n: Pick<BreakdownNode, 'value' | 'pricedHours'>): number | null {
  return n.pricedHours > 0 ? n.value / n.pricedHours : null;
}

function emptyKinds(): Record<KindKey, number> {
  return { servis: 0, montaza: 0, popravak: 0, dijagnostika: 0, ostalo: 0, none: 0 };
}

function newNode(key: string, label: string, sublabel?: string, kind?: KindKey): BreakdownNode {
  return { key, label, sublabel, kind, hours: 0, plan: 0, value: 0, pricedHours: 0, unpricedHours: 0, byKind: emptyKinds(), logs: [] };
}

interface Place { clientKey: string; clientLabel: string; siteKey: string; siteLabel: string; siteSub?: string }

/** Gdje je rad obavljen: klijent i objekt (ili "Ured / ostalo", ili stari slobodni tekst). */
function place(siteId: string | null | undefined, location: string | null | undefined, siteIndex: SiteIndex): Place {
  const hit = siteId ? siteIndex.get(siteId) : undefined;
  if (hit) {
    const addr = siteAddress(hit.site) || 'Objekt bez adrese';
    return {
      clientKey: `c:${hit.client.id}`,
      clientLabel: hit.client.name,
      siteKey: `s:${hit.site.id}`,
      siteLabel: hit.site.label ? `${addr} (${hit.site.label})` : addr,
      siteSub: hit.client.name,
    };
  }
  const loc = (location ?? '').trim();
  if (!siteId && loc && loc !== OFFICE_LOCATION) {
    return { clientKey: 'legacy', clientLabel: 'Nepovezane lokacije', siteKey: `l:${loc.toLowerCase()}`, siteLabel: loc, siteSub: 'Nije povezano s klijentom' };
  }
  return { clientKey: 'office', clientLabel: OFFICE_LOCATION, siteKey: 'office', siteLabel: OFFICE_LOCATION };
}

function orderNode(order: OrderRef | null): [string, () => BreakdownNode] {
  if (!order) return ['o:none', () => newNode('o:none', 'Bez naloga', 'Rad upisan bez naloga iz rasporeda', 'none')];
  return [`o:${order.id}`, () => newNode(`o:${order.id}`, order.title, KIND_LABEL[order.kind], order.kind)];
}

function child(parent: BreakdownNode, key: string, make: () => BreakdownNode, idx: Map<BreakdownNode, Map<string, BreakdownNode>>): BreakdownNode {
  let m = idx.get(parent);
  if (!m) { m = new Map(); idx.set(parent, m); parent.children = []; }
  let n = m.get(key);
  if (!n) { n = make(); m.set(key, n); parent.children!.push(n); }
  return n;
}

/**
 * Gdje je otišlo vrijeme: stablo (klijent → objekt → nalog, objekt → nalog ili samo nalog)
 * sa satima, planom, vrijednošću i raspodjelom po vrsti posla na svakoj razini.
 *
 * @param orderTotals ukupni sati po nalogu kroz sva razdoblja (za €/h = cijena / ukupni sati)
 */
export function buildBreakdown(
  logs: BreakdownLog[],
  plan: PlanItem[],
  siteIndex: SiteIndex,
  orderTotals: Map<string, number>,
  groupBy: GroupBy,
): Breakdown {
  const total = newNode('total', 'Ukupno');
  const top = new Map<string, BreakdownNode>();
  const idx = new Map<BreakdownNode, Map<string, BreakdownNode>>();
  const rows: BreakdownNode[] = [];

  const chain = (order: OrderRef | null, siteId: string | null | undefined, location: string | null | undefined): BreakdownNode[] => {
    const p = place(siteId, location, siteIndex);
    const [oKey, oMake] = orderNode(order);
    const topOf = (key: string, make: () => BreakdownNode) => {
      let n = top.get(key);
      if (!n) { n = make(); top.set(key, n); rows.push(n); }
      return n;
    };
    if (groupBy === 'order') {
      // "Bez naloga" po nalogu = jedan red; nalog dobiva klijenta/objekt u drugom redu
      const n = topOf(oKey, () => {
        const node = oMake();
        if (order) node.sublabel = `${KIND_LABEL[order.kind]} · ${p.siteSub ? `${p.siteSub}, ${p.siteLabel}` : p.siteLabel}`;
        return node;
      });
      return [n];
    }
    if (groupBy === 'site') {
      const s = topOf(p.siteKey, () => newNode(p.siteKey, p.siteLabel, p.siteSub));
      return [s, child(s, oKey, oMake, idx)];
    }
    const c = topOf(p.clientKey, () => newNode(p.clientKey, p.clientLabel));
    const s = child(c, p.siteKey, () => newNode(p.siteKey, p.siteLabel), idx);
    return [c, s, child(s, oKey, oMake, idx)];
  };

  for (const l of logs) {
    const h = Number(l.hours_worked);
    const kind: KindKey = l.order?.kind ?? 'none';
    const price = l.order?.price;
    const orderHours = l.order ? orderTotals.get(l.order.id) ?? 0 : 0;
    const priced = price !== null && price !== undefined && orderHours > 0;
    const value = priced ? (h * Number(price)) / orderHours : 0;
    // Mjesto rada nalog određuje objekt naloga (unos bez naloga – objekt iz unosa)
    for (const n of [total, ...chain(l.order, l.order ? l.order.site_id : l.site_id, l.location)]) {
      n.hours += h;
      n.byKind[kind] += h;
      n.logs.push(l);
      if (priced) { n.value += value; n.pricedHours += h; }
      else if (l.order) n.unpricedHours += h;
    }
  }

  for (const a of plan) {
    const h = Number(a.planned_hours);
    for (const n of [total, ...chain(a.order, a.order.site_id, null)]) n.plan += h;
  }

  const sortRec = (ns: BreakdownNode[]) => {
    ns.sort((a, b) => b.hours - a.hours || b.plan - a.plan || a.label.localeCompare(b.label, 'hr'));
    for (const n of ns) if (n.children) sortRec(n.children);
  };
  sortRec(rows);
  return { total, rows };
}

/** Top N redova + "Ostali" (zbroj ostatka) – za graf. */
export function topWithRest(rows: BreakdownNode[], n: number): BreakdownNode[] {
  if (rows.length <= n + 1) return rows;
  const rest = newNode('rest', `Ostali (${rows.length - n})`);
  for (const r of rows.slice(n)) {
    rest.hours += r.hours;
    rest.plan += r.plan;
    rest.value += r.value;
    rest.pricedHours += r.pricedHours;
    rest.unpricedHours += r.unpricedHours;
    for (const k of KIND_KEYS) rest.byKind[k] += r.byKind[k];
  }
  return [...rows.slice(0, n), rest];
}

/** Stablo u ravni popis (dubina prvo) – za izvoz. */
export function flattenBreakdown(rows: BreakdownNode[], depth = 0): { node: BreakdownNode; depth: number }[] {
  return rows.flatMap(n => [{ node: n, depth }, ...(n.children ? flattenBreakdown(n.children, depth + 1) : [])]);
}

/** CSV za Excel (hr): `;` separator, decimalni zarez, UTF-8 BOM. */
export function breakdownCsv(b: Breakdown, levels: string[], showValue: boolean): string {
  const num = (n: number) => (Math.round(n * 100) / 100).toString().replace('.', ',');
  const cell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = [...levels, 'Vrsta posla', 'Sati', 'Plan (h)', ...(showValue ? ['Vrijednost (€)', '€/h'] : [])];
  const lines = [header.join(';')];
  const path: string[] = [];
  for (const { node: n, depth } of flattenBreakdown(b.rows)) {
    path[depth] = n.label;
    path.length = depth + 1;
    const r = nodeRate(n);
    const names = levels.map((_, i) => (i <= depth ? path[i] : ''));
    lines.push([
      ...names,
      n.kind ? KIND_KEY_LABEL[n.kind] : '',
      num(n.hours),
      num(n.plan),
      ...(showValue ? [n.value > 0 ? num(n.value) : '', r !== null ? num(r) : ''] : []),
    ].map(v => cell(String(v))).join(';'));
  }
  return '﻿' + lines.join('\r\n');
}

export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
