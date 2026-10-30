import { ITEM_SLOTS, RARITY_COLORS, type Item, type ItemSlot } from '../items';

export type Equipment = Partial<Record<ItemSlot, Item>>;

const SLOT_LABEL: Record<ItemSlot, string> = {
  head: 'Kopf', chest: 'Brust', shoulders: 'Schultern', hands: 'Hände', arms: 'Arme',
  waist: 'Gürtel', legs: 'Beine', feet: 'Füße', weapon: 'Waffe',
};
const P = (d: string) => `<path d="${d}"/>`;
const ICONS: Record<string, string> = {
  Helm: P('M5 14V10a7 7 0 0 1 14 0v4l-2 5h-3v-4h-4v4H7zM9 11h6'),
  Hood: P('M12 3c-4 0-7 3-7 8 0 4 2 7 2 10h10c0-3 2-6 2-10 0-5-3-8-7-8zM8.5 11c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5-1.5 5-3.5 5-3.5-3-3.5-5z'),
  Crown: P('M3 18l1-10 5 5 3-7 3 7 5-5 1 10zM4 20h16'),
  Breastplate: P('M4 6l5-2c1 1.5 5 1.5 6 0l5 2-1 6-2 1v7H7v-7l-2-1zM12 6v14'),
  Tunic: P('M4 7l5-3c1 1.5 5 1.5 6 0l5 3-2 5-2-1v9H8v-9l-2 1zM9 12h6'),
  Robe: P('M9 3h6l2 5 3 4-3 1 2 8H5l2-8-3-1 3-4zM12 3v18'),
  Pauldrons: P('M2 13c0-5 4-8 8-8v8zM22 13c0-5-4-8-8-8v8zM4 17h6M14 17h6'),
  Mantle: P('M4 8c2-3 5-4 8-4s6 1 8 4l-2 12-6-3-6 3zM12 4v13'),
  Gloves: P('M8 21v-6l-3-4 1-2 2 2V4h2v7V3h2v8V4h2v8V6h2v9l-2 6z'),
  Gauntlets: P('M7 21v-5l-2-4 1-2 2 2V4h2v7V3h2v8V4h2v8V6h2v10l-2 5zM7 17h9'),
  Bracers: P('M6 4h12l-1 6 1 10H6l1-10zM7 9h10M7 15h10'),
  Vambraces: P('M7 3h10l-1 7 1 11H7l1-11zM8 8h8M8 15h8M12 8v7'),
  Belt: P('M2 9h20v6H2zM9 8v8h6V8zM11 11h2v2h-2z'),
  Faulds: P('M3 6h18l-1 6-2 8H6l-2-8zM3 10h18M8 6l1 14M16 6l-1 14'),
  Trousers: P('M6 3h12l1 18h-5l-2-11-2 11H5z'),
  Greaves: P('M7 3h10l-1 9 2 4v5H6v-5l2-4zM8 8h8'),
  Boots: P('M8 3h6v10l7 3v5H5V3zM8 8h6'),
  Sabatons: P('M7 3h7l1 9 6 4v4H4v-5zM7 8h7M4 18h17'),
  Sword: P('M19 2l3 3-9 9-3-3zM10 11l-4 4 3 3 4-4zM5 16l-3 4 2 2 4-3z'),
  Axe: P('M12 2v20M12 4c5-1 9 2 9 6-3 1-6 0-9 0zM11 3l1 1'),
  Mace: P('M12 22V11M12 2l3 3 3 1-2 3 1 3-3-1-2 2-2-2-3 1 1-3-2-3 3-1z'),
  Dagger: P('M12 2l3 9-3 3-3-3zM8 15h8v2H8zM11 17h2v5h-2z'),
};
const SLOT_ICON: Record<ItemSlot, string> = {
  head: 'Helm', chest: 'Breastplate', shoulders: 'Pauldrons', hands: 'Gloves', arms: 'Bracers',
  waist: 'Belt', legs: 'Greaves', feet: 'Boots', weapon: 'Sword',
};
function icon(baseType: string, slot: ItemSlot, it?: Item) {
  const body = ICONS[baseType] ?? ICONS[SLOT_ICON[slot]];
  const crack = it?.rarity === 'broken' ? '<path class="crack" d="M13 2l-3 7 4 3-3 5 2 5"/>' : '';
  return `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${body}${crack}</svg>`;
}
const DOLL = `<svg class="doll-bg" viewBox="0 0 100 160" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path d="M50 6c7 0 11 5 11 12 0 5-2 8-4 10v4c8 1 17 3 22 8l4 36-7 2-3-22-3 30 2 42-9 2-5-40-3 40-9-2 2-42-3-30-3 22-7-2 4-36c5-5 14-7 22-8v-4c-2-2-4-5-4-10 0-7 4-12 11-12z"/></svg>`;
type SortKey = 'rarity' | 'slot' | 'level';
const RANK: Record<string, number> = { broken: 0, common: 1, magic: 2, rare: 3, legendary: 4, divine: 5 };
const avgDmg = (i?: Item) => (i ? ((i.stats.damageMin ?? 0) + (i.stats.damageMax ?? 0)) / 2 : 0);
const r2 = (n: number) => Math.round(n * 100) / 100;
function delta(d: number) {
  if (Math.abs(d) < 0.005) return '';
  return `<em class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '▲ +' : '▼ '}${r2(d)}</em>`;
}
function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export class Inventory {
  bag: Item[] = [];
  equipped: Equipment = {};
  /** Called whenever the equipment changed (rebuild the hero). */
  onEquipmentChange: (eq: Equipment) => void = () => {};
  private open = false;
  private selected: { item: Item; from: 'bag' | 'slot' } | null = null;
  private sort: SortKey = 'rarity';
  private filter: ItemSlot | 'all' = 'all';
  private root: HTMLDivElement;
  private button: HTMLButtonElement;
  private panel: HTMLDivElement;

  constructor() {
    this.button = document.createElement('button');
    this.button.id = 'bag-btn';
    this.button.setAttribute('aria-label', 'Inventar (I)');
    this.button.innerHTML = '<span>🎒</span><small id="bag-count"></small>';
    this.button.addEventListener('click', () => this.toggle());
    this.root = document.createElement('div');
    this.root.id = 'inv';
    this.root.hidden = true;
    this.root.innerHTML = '<div class="inv-backdrop"></div><section class="inv-panel"></section>';
    this.panel = this.root.querySelector('.inv-panel')!;
    this.root.querySelector('.inv-backdrop')!.addEventListener('click', () => this.toggle(false));
    this.panel.addEventListener('click', (e) => this.onClick(e));
    document.body.append(this.button, this.root);
    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'i') this.toggle();
      else if (k === 'escape' && this.open) this.toggle(false);
    });
    this.updateCount();
  }

  isOpen() {
    return this.open;
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.root.hidden = !this.open;
    if (this.open) this.render();
  }

  addToBag(item: Item) {
    this.bag.push(item);
    this.updateCount();
    if (this.open) this.render();
  }

  private updateCount() {
    const el = this.button.querySelector('#bag-count');
    if (el) el.textContent = String(this.bag.length);
  }

  private equip(item: Item) {
    const old = this.equipped[item.slot];
    this.bag = this.bag.filter((i) => i !== item);
    if (old) this.bag.push(old);
    this.equipped[item.slot] = item;
    this.selected = { item, from: 'slot' };
    this.changed();
  }

  private unequip(item: Item) {
    delete this.equipped[item.slot];
    this.bag.push(item);
    this.selected = { item, from: 'bag' };
    this.changed();
  }

  private drop(item: Item) {
    this.bag = this.bag.filter((i) => i !== item);
    this.selected = null;
    this.updateCount();
    this.render();
  }

  private changed() {
    this.updateCount();
    this.render();
    this.onEquipmentChange(this.equipped);
  }

  private onClick(e: Event) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    const act = el.dataset.act!;
    const sel = this.selected;
    if (act === 'close') return this.toggle(false);
    if (act === 'bag') {
      const item = this.bag.find((i) => i.id === el.dataset.id);
      if (item && sel?.item === item && sel.from === 'bag') return this.equip(item); // second tap / click equips
      if (item) this.selected = { item, from: 'bag' };
    } else if (act === 'slot') {
      const item = this.equipped[el.dataset.slot as ItemSlot];
      this.selected = item ? { item, from: 'slot' } : null;
    } else if (act === 'sort') this.sort = el.dataset.k as SortKey;
    else if (act === 'filter') this.filter = el.dataset.k as ItemSlot | 'all';
    else if (act === 'equip' && sel) return this.equip(sel.item);
    else if (act === 'unequip' && sel) return this.unequip(sel.item);
    else if (act === 'drop' && sel && sel.from === 'bag') return this.drop(sel.item);
    this.render();
  }

  private statRows(it: Item, cmp?: Item) {
    const rows: string[] = [];
    const row = (label: string, val: string, d: number, big = false) =>
      rows.push(`<li class="${big ? 'main' : ''}"><span>${label}</span><b>${val}${cmp ? delta(d) : ''}</b></li>`);
    if (it.slot === 'weapon') {
      row('Schaden', `${it.stats.damageMin}–${it.stats.damageMax}`, avgDmg(it) - avgDmg(cmp), true);
      row('Tempo', String(it.stats.speed ?? 1), (it.stats.speed ?? 1) - (cmp?.stats.speed ?? 0));
    } else row('Rüstung', String(it.stats.armor ?? 0), (it.stats.armor ?? 0) - (cmp?.stats.armor ?? 0), true);
    return rows.join('');
  }

  private render() {
    const keep = this.panel.querySelector('.inv-body')?.scrollTop ?? 0;
    const sel = this.selected;
    const slotBtn = (s: ItemSlot) => {
      const it = this.equipped[s];
      const on = sel && sel.item === it ? ' sel' : '';
      const cls = it ? ` full r-${it.rarity}${it.theme?.glow && it.theme.glow > 0.3 ? ' glow' : ''}` : '';
      const style = it ? ` style="--rc:${RARITY_COLORS[it.rarity]}"` : '';
      return `<button class="cell slot s-${s}${cls}${on}" data-act="slot" data-slot="${s}"${style} aria-label="${SLOT_LABEL[s]}">
        ${icon(it?.baseType ?? SLOT_ICON[s], s, it)}<small>${it ? esc(it.baseType) : SLOT_LABEL[s]}</small></button>`;
    };
    const doll = `<div class="paperdoll">${DOLL}${ITEM_SLOTS.map(slotBtn).join('')}</div>`;
    const armor = ITEM_SLOTS.reduce((a, s) => a + (this.equipped[s]?.stats.armor ?? 0), 0);
    const w = this.equipped.weapon;
    const summary = `<div class="summary"><div><span>Rüstung</span><b>${armor}</b></div>
      <div><span>Schaden</span><b>${w ? `${w.stats.damageMin}–${w.stats.damageMax}` : '1–2'}</b></div>
      <div><span>Ausgerüstet</span><b>${Object.keys(this.equipped).length}/${ITEM_SLOTS.length}</b></div></div>`;

    let items = this.bag.filter((i) => this.filter === 'all' || i.slot === this.filter);
    const so = ITEM_SLOTS;
    items = [...items].sort((a, b) =>
      this.sort === 'rarity' ? RANK[b.rarity] - RANK[a.rarity] || b.level - a.level
      : this.sort === 'level' ? b.level - a.level || RANK[b.rarity] - RANK[a.rarity]
      : so.indexOf(a.slot) - so.indexOf(b.slot) || RANK[b.rarity] - RANK[a.rarity]);
    const cells = Math.max(20, Math.ceil(items.length / 5) * 5);
    let bag = '';
    for (let i = 0; i < cells; i++) {
      const it = items[i];
      if (!it) { bag += '<div class="cell empty"></div>'; continue; }
      const on = sel && sel.item === it ? ' sel' : '';
      const glow = it.theme?.glow && it.theme.glow > 0.3 ? ' glow' : '';
      bag += `<button class="cell full r-${it.rarity}${glow}${on}" data-act="bag" data-id="${esc(it.id)}" style="--rc:${RARITY_COLORS[it.rarity]}" aria-label="${esc(it.name)}">
        ${icon(it.baseType, it.slot, it)}<small>${it.level}</small></button>`;
    }
    const chip = (act: string, k: string, label: string, cur: string) =>
      `<button class="chip${cur === k ? ' on' : ''}" data-act="${act}" data-k="${k}">${label}</button>`;
    const sorts = (['rarity', 'slot', 'level'] as SortKey[]).map((k) => chip('sort', k, { rarity: 'Seltenheit', slot: 'Slot', level: 'Stufe' }[k], this.sort)).join('');
    const filters = ['all' as const, ...ITEM_SLOTS].map((k) => chip('filter', k, k === 'all' ? 'Alle' : SLOT_LABEL[k], this.filter)).join('');

    let detail = '<p class="hint">Gegenstand antippen für Details.<br>Nochmal antippen = anlegen.</p>';
    if (sel) {
      const it = sel.item;
      const cmp = sel.from === 'bag' ? this.equipped[it.slot] : undefined;
      const aff = it.affixes.map((a) => `<li class="affix">${esc(a.text)}</li>`).join('');
      const note = cmp ? `<p class="cmp">Vergleich mit: <span style="color:${RARITY_COLORS[cmp.rarity]}">${esc(cmp.name)}</span></p>` : sel.from === 'bag' ? '<p class="cmp">Slot ist frei.</p>' : '';
      detail = `<div class="dhead">${icon(it.baseType, it.slot, it).replace('class="ic"', `class="ic big r-${it.rarity}" style="color:${RARITY_COLORS[it.rarity]}"`)}
        <div><h3 style="color:${RARITY_COLORS[it.rarity]}">${esc(it.name)}</h3>
        <p class="sub">${esc(it.rarity)} ${esc(it.baseType)} · Stufe ${it.level}</p></div></div>
        <ul class="stats">${this.statRows(it, cmp)}</ul>${aff ? `<ul class="affixes">${aff}</ul>` : ''}${note}
        <div class="btns"><button class="act" data-act="${sel.from === 'slot' ? 'unequip' : 'equip'}">${sel.from === 'slot' ? 'Ablegen' : 'Anlegen'}</button>
        ${sel.from === 'bag' ? '<button class="act drop" data-act="drop">Wegwerfen</button>' : ''}</div>`;
    }
    this.panel.innerHTML = `<header><b>Inventar</b><button class="x" data-act="close" aria-label="Schließen">✕</button></header>
      <div class="inv-body"><div class="inv-col"><h4>Ausrüstung</h4>${doll}${summary}</div>
      <div class="inv-col"><div class="detail">${detail}</div>
      <h4>Beutel <span class="count">${this.bag.length}${this.filter !== 'all' ? ` · ${items.length} gefiltert` : ''}</span></h4>
      <div class="chips">${sorts}</div><div class="chips">${filters}</div>
      <div class="grid bag">${bag}</div></div></div>`;
    const bd = this.panel.querySelector('.inv-body');
    if (bd) bd.scrollTop = keep;
  }
}
