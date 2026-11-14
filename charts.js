// Small dependency-free SVG charts.

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const GRADE_COLORS = { A: "#0f9aa8", B: "#5cb8c2", C: "#e8a317", D: "#d1293d" };
export const gradeColor = g => GRADE_COLORS[g] || "#888";

export function gauge(score, grade) {
  const r = 80, cx = 100, cy = 100;
  const angle = Math.PI * (1 - Math.min(100, Math.max(0, score)) / 100);
  const arc = (from, to, color) => {
    const a0 = Math.PI * (1 - from / 100), a1 = Math.PI * (1 - to / 100);
    const x0 = cx + r * Math.cos(a0), y0 = cy - r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy - r * Math.sin(a1);
    return `<path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}" stroke="${color}" stroke-width="18" fill="none"/>`;
  };
  const nx = cx + (r - 6) * Math.cos(angle), ny = cy - (r - 6) * Math.sin(angle);
  return `<svg viewBox="0 0 200 130" class="gauge" role="img" aria-label="Score ${score}, grade ${grade}">
    ${arc(0, 49.5, "#f4c2c8")}${arc(50, 64.5, "#f6dc9c")}${arc(65, 79.5, "#a9dbe0")}${arc(80, 100, "#0f9aa8")}
    <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="#14213d" stroke-width="4" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="6" fill="#14213d"/>
    <text x="${cx}" y="${cy + 26}" text-anchor="middle" class="gauge-num">${score.toFixed(1)}</text>
  </svg>`;
}

export function radar(series, labels) {
  // series: [{name, color, values:[0..100]}]
  const n = labels.length, cx = 160, cy = 140, R = 100;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [cx + R * (v / 100) * Math.cos(a), cy + R * (v / 100) * Math.sin(a)];
  };
  let g = "";
  for (const lvl of [25, 50, 75, 100]) {
    g += `<polygon points="${labels.map((_, i) => pt(i, lvl).join(",")).join(" ")}" fill="none" stroke="#dfe3ea"/>`;
  }
  labels.forEach((l, i) => {
    const [x, y] = pt(i, 100), [lx, ly] = pt(i, 122);
    g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#dfe3ea"/>`;
    g += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" class="radar-label">${esc(l)}</text>`;
  });
  for (const s of series) {
    g += `<polygon points="${s.values.map((v, i) => pt(i, v).join(",")).join(" ")}" fill="${s.color}" fill-opacity="0.18" stroke="${s.color}" stroke-width="2.5"/>`;
  }
  const legend = series.map((s, i) => `<g transform="translate(${10 + i * 150},282)"><rect width="12" height="12" rx="2" fill="${s.color}"/><text x="18" y="10" class="radar-label">${esc(s.name)}</text></g>`).join("");
  return `<svg viewBox="0 0 320 300" class="radar" role="img" aria-label="Domain scores radar">${g}${legend}</svg>`;
}

export function waterfall(domains, total) {
  // Domain points stacking up to the total (like the proposal's Figure 16).
  const W = 560, H = 230, pad = 34, bw = (W - pad * 2) / (domains.length + 1) - 10;
  const y = v => H - 30 - (v / 100) * (H - 50);
  let acc = 0, g = "";
  g += `<line x1="${pad}" y1="${y(80)}" x2="${W - 8}" y2="${y(80)}" stroke="#d1293d" stroke-dasharray="4 4"/><text x="${pad + 2}" y="${y(80) - 4}" class="axis">Grade A ≥ 80</text>`;
  domains.forEach((d, i) => {
    const x = pad + i * (bw + 10);
    const top = y(acc + d.points), bottom = y(acc);
    g += `<rect x="${x}" y="${top}" width="${bw}" height="${Math.max(1, bottom - top)}" fill="${d.color}" rx="2"/>`;
    g += `<text x="${x + bw / 2}" y="${top - 4}" text-anchor="middle" class="bar-val">+${d.points.toFixed(1)}</text>`;
    g += `<text x="${x + bw / 2}" y="${H - 14}" text-anchor="middle" class="axis">${esc(d.short.split(" ")[0])}</text>`;
    acc += d.points;
  });
  const x = pad + domains.length * (bw + 10);
  g += `<rect x="${x}" y="${y(total)}" width="${bw}" height="${y(0) - y(total)}" fill="#e8a317" rx="2"/>`;
  g += `<text x="${x + bw / 2}" y="${y(total) - 4}" text-anchor="middle" class="bar-val strong">${total.toFixed(1)}</text>`;
  g += `<text x="${x + bw / 2}" y="${H - 14}" text-anchor="middle" class="axis">Score</text>`;
  g += `<line x1="${pad - 6}" y1="${y(0)}" x2="${W - 8}" y2="${y(0)}" stroke="#9aa3b2"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="waterfall" role="img" aria-label="How the score adds up">${g}</svg>`;
}

export function bars(items) {
  // items: [{label, value, max, color, note}] horizontal bars
  return `<div class="hbars">${items.map(it => `
    <div class="hbar">
      <div class="hbar-label">${esc(it.label)}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(1, (it.value / it.max) * 100)}%;background:${it.color}"></div></div>
      <div class="hbar-val">${esc(it.note ?? it.value)}</div>
    </div>`).join("")}</div>`;
}
