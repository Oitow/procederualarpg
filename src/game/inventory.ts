import { ITEM_SLOTS, RARITY_COLORS, type Item, type ItemSlot } from '../items';

export type Equipment = Partial<Record<ItemSlot, Item>>;

const SLOT_LABEL: Record<ItemSlot, string> = {
  head: 'Kopf', chest: 'Brust', shoulders: 'Schultern', hands: 'Hände', arms: 'Arme',
  waist: 'Gürtel', legs: 'Beine', feet: 'Füße', weapon: 'Waffe',
};
const SLOT_GLYPH: Record<ItemSlot, string> = {
  head: '⛑', chest: '🛡', shoulders: '⌓', hands: '✋', arms: '⌒', waist: '▭', legs: '⏸', feet: '⌊', weapon: '⚔',
};

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

  private changed() {
    this.updateCount();
    this.render();
    this.onEquipmentChange(this.equipped);
  }

  private onClick(e: Event) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    const act = el.dataset.act!;
    if (act === 'close') return this.toggle(false);
    if (act === 'bag') {
      const item = this.bag[Number(el.dataset.i)];
      if (item) this.selected = { item, from: 'bag' };
    } else if (act === 'slot') {
      const item = this.equipped[el.dataset.slot as ItemSlot];
      this.selected = item ? { item, from: 'slot' } : null;
    } else if (act === 'equip' && this.selected) return this.equip(this.selected.item);
    else if (act === 'unequip' && this.selected) return this.unequip(this.selected.item);
    this.render();
  }

  private render() {
    const sel = this.selected;
    const slots = ITEM_SLOTS.map((s) => {
      const it = this.equipped[s];
      const style = it ? ` style="--rc:${RARITY_COLORS[it.rarity]}"` : '';
      const on = sel && sel.item === it ? ' sel' : '';
      return `<button class="cell slot${it ? ' full' : ''}${on}" data-act="slot" data-slot="${s}"${style}>
        <i>${SLOT_GLYPH[s]}</i><small>${it ? esc(it.name) : SLOT_LABEL[s]}</small></button>`;
    }).join('');
    const MIN = 20;
    const cells = Math.max(MIN, Math.ceil(this.bag.length / 4) * 4);
    let bag = '';
    for (let i = 0; i < cells; i++) {
      const it = this.bag[i];
      if (!it) {
        bag += '<div class="cell empty"></div>';
        continue;
      }
      const on = sel && sel.item === it ? ' sel' : '';
      bag += `<button class="cell full${on}" data-act="bag" data-i="${i}" style="--rc:${RARITY_COLORS[it.rarity]}">
        <i>${SLOT_GLYPH[it.slot]}</i><small>${esc(it.baseType)}</small></button>`;
    }
    let detail = '<p class="hint">Gegenstand antippen für Details.</p>';
    if (sel) {
      const it = sel.item;
      const stats = Object.entries(it.stats)
        .map(([k, v]) => `<li><span>${esc(k)}</span><b>${Math.round(v * 100) / 100}</b></li>`)
        .join('');
      const affixes = it.affixes.map((a) => `<li class="affix">${esc(a.text)}</li>`).join('');
      detail = `<h3 style="color:${RARITY_COLORS[it.rarity]}">${esc(it.name)}</h3>
        <p class="sub">${esc(it.rarity)} ${esc(it.baseType)} · Stufe ${it.level} · ${SLOT_LABEL[it.slot]}</p>
        <ul>${stats}${affixes}</ul>
        <button class="act" data-act="${sel.from === 'slot' ? 'unequip' : 'equip'}">${sel.from === 'slot' ? 'Ablegen' : 'Anlegen'}</button>`;
    }
    this.panel.innerHTML = `<header><b>Inventar</b><button class="x" data-act="close" aria-label="Schließen">✕</button></header>
      <div class="inv-body"><div class="inv-col"><h4>Ausrüstung</h4><div class="grid slots">${slots}</div>
      <div class="detail">${detail}</div></div>
      <div class="inv-col"><h4>Beutel</h4><div class="grid bag">${bag}</div></div></div>`;
  }
}
