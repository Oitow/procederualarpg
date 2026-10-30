const CSS = `
#gv-hud{position:fixed;z-index:15;left:max(16px,env(safe-area-inset-left,0px));bottom:calc(44px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:10px;pointer-events:none;font-family:Georgia,serif;color:#d8d2c0}
#gv-orb{position:relative;width:72px;height:72px;border-radius:50%;border:2px solid #b08d4a;background:#1a0a0a;overflow:hidden;box-shadow:0 4px 14px #000a, inset 0 0 12px #000}
#gv-orb i{position:absolute;left:0;right:0;bottom:0;height:100%;background:linear-gradient(180deg,#d23a2a,#7d1010);transition:height .15s}
#gv-orb b{position:absolute;inset:0;display:grid;place-items:center;font:700 14px system-ui;text-shadow:0 1px 3px #000}
#gv-orb.hit{border-color:#ff5a3a}
#gv-stats{display:flex;flex-direction:column;gap:2px;font-size:13px;text-shadow:0 1px 3px #000;background:rgba(8,14,18,.55);padding:5px 10px;border-radius:6px;border:1px solid #2a3a3a}
#gv-stats span{color:#c9a45a}
#gv-dead{position:fixed;inset:0;z-index:14;display:grid;place-items:center;pointer-events:none;background:rgba(60,0,0,.35);color:#e8c8b8;font:700 26px Georgia,serif;letter-spacing:.2em;opacity:0;transition:opacity .3s}
#gv-dead.on{opacity:1}
`;

export class Hud {
  private orb: HTMLElement;
  private fill: HTMLElement;
  private num: HTMLElement;
  private stats: HTMLElement;
  private dead: HTMLElement;
  private last = '';

  constructor() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    const root = document.createElement('div');
    root.id = 'gv-hud';
    root.innerHTML = '<div id="gv-orb"><i></i><b></b></div><div id="gv-stats"></div>';
    document.body.appendChild(root);
    this.orb = root.querySelector('#gv-orb')!;
    this.fill = root.querySelector('i')!;
    this.num = root.querySelector('b')!;
    this.stats = root.querySelector('#gv-stats')!;
    this.dead = document.createElement('div');
    this.dead.id = 'gv-dead';
    this.dead.textContent = 'YOU DIED';
    document.body.appendChild(this.dead);
  }

  set(hp: number, maxHp: number, kills: number, wave: number, dead: boolean, alive: number) {
    const h = Math.ceil(Math.max(0, hp));
    const key = `${h}|${maxHp}|${kills}|${wave}|${dead}|${alive}`;
    if (key === this.last) return;
    this.last = key;
    this.fill.style.height = `${Math.max(0, Math.min(1, hp / maxHp)) * 100}%`;
    this.num.textContent = String(h);
    this.stats.innerHTML = `Kills <span>${kills}</span><br>Wave <span>${wave}</span> · ${alive} foes`;
    this.dead.classList.toggle('on', dead);
  }

  flashHit() {
    this.orb.classList.add('hit');
    setTimeout(() => this.orb.classList.remove('hit'), 120);
  }
}
