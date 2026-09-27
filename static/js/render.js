/* DMFT Sahayak - safe Markdown, tables and SVG charts for chat answers. */
(() => {
  "use strict";

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const NUMERIC = /^\s*(?:₹|rs\.?|inr)?\s*-?[\d,]*\.?\d+\s*(?:%|cr|crore|lakh|lakhs|km|करोड़|लाख)?\s*$/i;
  const TOTAL_ROW = /^(total|grand total|कुल|योग)$/i;

  function toNumber(text) {
    const match = String(text).replace(/,/g, "").match(/-?\d*\.?\d+/);
    return match ? parseFloat(match[0]) : NaN;
  }

  function inline(text) {
    let html = esc(text);
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=[\s).,;:!?।]|$)/g, "$1<em>$2</em>");
    html = html.replace(/\[(\d{1,2})\]/g, '<a class="cite" data-n="$1" href="#" aria-label="Source $1">$1</a>');
    html = html.replace(/(https?:\/\/[^\s<)"]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    return html;
  }

  const splitRow = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const isSeparator = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
  const stripInline = (text) => String(text).replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[(\d{1,2})\]/g, "").trim();

  function numericColumns(table) {
    return table.headers.map((_, col) => {
      const values = table.rows.map((r) => r[col]).filter((v) => v !== undefined && String(v).trim() !== "" && String(v).trim() !== "-");
      return values.length > 0 && values.every((v) => NUMERIC.test(stripInline(v)));
    });
  }

  function validChart(spec) {
    if (!spec || typeof spec !== "object") return null;
    const type = ["bar", "line", "pie"].includes(spec.type) ? spec.type : "bar";
    const labels = Array.isArray(spec.labels) ? spec.labels.slice(0, 40).map((l) => String(l)) : [];
    const series = (Array.isArray(spec.series) ? spec.series : [])
      .slice(0, 4)
      .map((s) => ({ name: String(s?.name ?? ""), data: (Array.isArray(s?.data) ? s.data : []).map(Number) }))
      .filter((s) => s.data.length === labels.length && s.data.every((n) => Number.isFinite(n)));
    if (!labels.length || !series.length) return null;
    return { type, title: String(spec.title || ""), labels, series, unit: String(spec.unit || "") };
  }

  /** Markdown -> { html, tables, charts }. Tables and charts are returned as data for export. */
  function renderMarkdown(source) {
    const lines = String(source || "").replace(/\r/g, "").split("\n");
    const out = [];
    const tables = [];
    const charts = [];
    let para = [];
    let listStack = [];
    let lastTitle = "";

    const flushPara = () => {
      if (!para.length) return;
      const onlyBold = para.length === 1 && /^\*\*[^*]+\*\*:?$/.test(para[0].trim());
      if (onlyBold) lastTitle = stripInline(para[0]).replace(/:$/, "");
      out.push(`<p${onlyBold ? ' class="md-title"' : ""}>${para.map(inline).join("<br>")}</p>`);
      para = [];
    };
    const closeLists = (depth = 0) => {
      while (listStack.length > depth) out.push(`</${listStack.pop()}>`);
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fence = line.match(/^\s*```\s*([\w-]*)\s*$/);
      if (fence) {
        flushPara(); closeLists();
        const body = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++]);
        if (fence[1].toLowerCase() === "chart") {
          let spec = null;
          try { spec = validChart(JSON.parse(body.join("\n"))); } catch { spec = null; }
          if (spec) {
            charts.push(spec);
            out.push(`<div class="md-chart" data-chart="${charts.length - 1}"></div>`);
          }
        } else {
          out.push(`<pre class="md-pre">${esc(body.join("\n"))}</pre>`);
        }
        continue;
      }

      if (line.includes("|") && i + 1 < lines.length && isSeparator(lines[i + 1]) && (line.trim().startsWith("|") || line.split("|").length > 2)) {
        flushPara(); closeLists();
        const headers = splitRow(line);
        const rows = [];
        i += 2;
        while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(splitRow(lines[i++]));
        i--;
        const table = { title: lastTitle, headers: headers.map(stripInline), rows: rows.map((r) => headers.map((_, c) => stripInline(r[c] ?? ""))) };
        const numeric = numericColumns(table);
        tables.push(table);
        const index = tables.length - 1;
        const head = headers.map((h, c) => `<th${numeric[c] ? ' class="num"' : ""}>${inline(h)}</th>`).join("");
        const body = rows.map((r) => {
          const isTotal = TOTAL_ROW.test(stripInline(r[0] ?? ""));
          return `<tr${isTotal ? ' class="total"' : ""}>${headers.map((_, c) => `<td${numeric[c] ? ' class="num"' : ""}>${inline(r[c] ?? "")}</td>`).join("")}</tr>`;
        }).join("");
        out.push(`<div class="md-table" data-table="${index}"><div class="md-table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></div>`);
        lastTitle = "";
        continue;
      }

      const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
      if (heading) {
        flushPara(); closeLists();
        lastTitle = stripInline(heading[1]);
        out.push(`<p class="md-title">${inline(heading[1])}</p>`);
        continue;
      }

      const item = line.match(/^(\s*)([-*•]|\d+[.)])\s+(.*)$/);
      if (item) {
        flushPara();
        const depth = Math.min(Math.floor(item[1].replace(/\t/g, "  ").length / 2), 2) + 1;
        const type = /\d/.test(item[2]) ? "ol" : "ul";
        closeLists(depth);
        while (listStack.length < depth) { out.push(`<${type}>`); listStack.push(type); }
        if (listStack[depth - 1] !== type) { closeLists(depth - 1); out.push(`<${type}>`); listStack.push(type); }
        out.push(`<li>${inline(item[3])}</li>`);
        continue;
      }

      if (!line.trim()) { flushPara(); closeLists(); continue; }
      closeLists();
      para.push(line.trim());
    }
    flushPara(); closeLists();
    return { html: out.join(""), tables, charts };
  }

  /** A bar chart built from a table: first column = labels, first numeric column = values. */
  function tableToChart(table) {
    const numeric = numericColumns(table);
    const col = numeric.findIndex((isNum, i) => isNum && i > 0);
    if (col < 0) return null;
    const rows = table.rows.filter((r) => !TOTAL_ROW.test(r[0] || ""));
    if (rows.length < 2 || rows.length > 30) return null;
    return validChart({
      type: "bar",
      title: table.title || table.headers[col],
      labels: rows.map((r) => r[0]),
      series: [{ name: table.headers[col], data: rows.map((r) => toNumber(r[col])) }],
      unit: /%/.test(rows[0][col]) ? "%" : "",
    });
  }

  // ------------------------------------------------------------------ SVG charts

  const PALETTE = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)", "var(--c7)", "var(--c8)"];

  function niceMax(value) {
    if (value <= 0) return 1;
    const power = Math.pow(10, Math.floor(Math.log10(value)));
    const scaled = value / power;
    const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
    return step * power;
  }

  const fmt = (n, unit = "") => {
    const abs = Math.abs(n);
    const text = abs >= 1e7 ? (n / 1e7).toFixed(1).replace(/\.0$/, "") + " Cr" : abs >= 1e5 ? (n / 1e5).toFixed(1).replace(/\.0$/, "") + " L" : n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    return unit === "%" ? `${text}%` : text;
  };

  function wrapLabel(label, max = 12) {
    const words = String(label).split(/\s+/);
    const lines = [""];
    for (const word of words) {
      const current = lines[lines.length - 1];
      if (current && (current + " " + word).length > max) {
        if (lines.length === 2) { lines[1] = (lines[1] + " " + word).slice(0, max - 1) + "…"; break; }
        lines.push(word);
      } else lines[lines.length - 1] = current ? current + " " + word : word;
    }
    return lines.map((l) => (l.length > max + 2 ? l.slice(0, max) + "…" : l));
  }

  function legend(series, y, width) {
    if (series.length < 2) return "";
    let x = 0;
    const items = series.map((s, i) => {
      const item = `<g transform="translate(${x},0)"><rect width="10" height="10" rx="2" style="fill:${PALETTE[i]}"/><text x="14" y="9" class="c-legend">${esc(s.name)}</text></g>`;
      x += 24 + s.name.length * 6.5;
      return item;
    });
    return `<g transform="translate(${Math.max(8, (width - x) / 2)},${y})">${items.join("")}</g>`;
  }

  function barChart(spec) {
    const n = spec.labels.length;
    const horizontal = n > 8 || spec.labels.some((l) => l.length > 18);
    const max = niceMax(Math.max(...spec.series.flatMap((s) => s.data), 0));
    const multi = spec.series.length;
    if (horizontal) {
      const rowH = 26 * Math.max(1, multi * 0.8), labelW = 150, W = 640, top = 10, right = 56;
      const H = top + n * rowH + (multi > 1 ? 34 : 14);
      const plotW = W - labelW - right;
      let svg = "";
      for (let g = 0; g <= 4; g++) {
        const x = labelW + (plotW * g) / 4;
        svg += `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + n * rowH}" class="c-grid"/>`;
      }
      spec.labels.forEach((label, i) => {
        const y = top + i * rowH;
        svg += `<text x="${labelW - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" class="c-label">${esc(label.length > 24 ? label.slice(0, 23) + "…" : label)}</text>`;
        const barH = (rowH - 8) / multi;
        spec.series.forEach((s, k) => {
          const w = Math.max(1, (s.data[i] / max) * plotW);
          const by = y + 4 + k * barH;
          svg += `<rect x="${labelW}" y="${by}" width="${w}" height="${barH - 2}" rx="3" style="fill:${PALETTE[k]}"><title>${esc(label)}: ${fmt(s.data[i], spec.unit)}</title></rect>`;
          svg += `<text x="${labelW + w + 5}" y="${by + barH / 2 + 3}" class="c-value">${fmt(s.data[i], spec.unit)}</text>`;
        });
      });
      svg += legend(spec.series, top + n * rowH + 12, W);
      return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(spec.title)}">${svg}</svg>`;
    }
    const W = 640, H = 320, left = 48, right = 12, top = 22, bottom = multi > 1 ? 74 : 50;
    const plotW = W - left - right, plotH = H - top - bottom;
    const slot = plotW / n, groupW = Math.min(slot * 0.7, 72 * multi), barW = groupW / multi;
    let svg = "";
    for (let g = 0; g <= 4; g++) {
      const y = top + plotH - (plotH * g) / 4;
      svg += `<line x1="${left}" y1="${y}" x2="${W - right}" y2="${y}" class="c-grid"/><text x="${left - 6}" y="${y + 4}" text-anchor="end" class="c-axis">${fmt((max * g) / 4, spec.unit)}</text>`;
    }
    spec.labels.forEach((label, i) => {
      const x0 = left + i * slot + (slot - groupW) / 2;
      spec.series.forEach((s, k) => {
        const h = Math.max(1, (s.data[i] / max) * plotH);
        const x = x0 + k * barW;
        svg += `<rect x="${x + 1}" y="${top + plotH - h}" width="${barW - 2}" height="${h}" rx="4" style="fill:${PALETTE[multi > 1 ? k : 0]}"><title>${esc(label)}: ${fmt(s.data[i], spec.unit)}</title></rect>`;
        svg += `<text x="${x + barW / 2}" y="${top + plotH - h - 6}" text-anchor="middle" class="c-value">${fmt(s.data[i], spec.unit)}</text>`;
      });
      wrapLabel(label, n > 6 ? 10 : 14).forEach((part, line) => {
        svg += `<text x="${left + i * slot + slot / 2}" y="${top + plotH + 18 + line * 14}" text-anchor="middle" class="c-label">${esc(part)}</text>`;
      });
    });
    svg += legend(spec.series, H - 18, W);
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(spec.title)}">${svg}</svg>`;
  }

  function lineChart(spec) {
    const W = 640, H = 300, left = 48, right = 16, top = 22, bottom = spec.series.length > 1 ? 70 : 46;
    const plotW = W - left - right, plotH = H - top - bottom, n = spec.labels.length;
    const max = niceMax(Math.max(...spec.series.flatMap((s) => s.data), 0));
    const X = (i) => left + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
    const Y = (v) => top + plotH - (v / max) * plotH;
    let svg = "";
    for (let g = 0; g <= 4; g++) {
      const y = top + plotH - (plotH * g) / 4;
      svg += `<line x1="${left}" y1="${y}" x2="${W - right}" y2="${y}" class="c-grid"/><text x="${left - 6}" y="${y + 4}" text-anchor="end" class="c-axis">${fmt((max * g) / 4, spec.unit)}</text>`;
    }
    const step = Math.ceil(n / 8);
    spec.labels.forEach((label, i) => {
      if (i % step === 0) svg += `<text x="${X(i)}" y="${top + plotH + 18}" text-anchor="middle" class="c-label">${esc(wrapLabel(label, 10)[0])}</text>`;
    });
    spec.series.forEach((s, k) => {
      const points = s.data.map((v, i) => `${X(i)},${Y(v)}`).join(" ");
      svg += `<polyline points="${points}" fill="none" style="stroke:${PALETTE[k]}" stroke-width="2.5" stroke-linejoin="round"/>`;
      s.data.forEach((v, i) => {
        svg += `<circle cx="${X(i)}" cy="${Y(v)}" r="4" style="fill:${PALETTE[k]}" stroke="var(--surface)" stroke-width="2"><title>${esc(spec.labels[i])}: ${fmt(v, spec.unit)}</title></circle>`;
      });
    });
    svg += legend(spec.series, H - 18, W);
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(spec.title)}">${svg}</svg>`;
  }

  function pieChart(spec) {
    const data = spec.series[0].data.map((v) => Math.max(0, v));
    const total = data.reduce((a, b) => a + b, 0) || 1;
    const W = 640, H = Math.max(240, 30 + spec.labels.length * 24), cx = 140, cy = H / 2, r = 100, inner = 58;
    let angle = -Math.PI / 2, svg = "";
    data.forEach((v, i) => {
      const slice = (v / total) * Math.PI * 2;
      const end = angle + slice;
      const large = slice > Math.PI ? 1 : 0;
      const p = (a, rad) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
      const path = slice >= Math.PI * 2 - 1e-6
        ? `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 M ${cx - inner} ${cy} a ${inner} ${inner} 0 1 1 ${2 * inner} 0 a ${inner} ${inner} 0 1 1 ${-2 * inner} 0`
        : `M ${p(angle, r)} A ${r} ${r} 0 ${large} 1 ${p(end, r)} L ${p(end, inner)} A ${inner} ${inner} 0 ${large} 0 ${p(angle, inner)} Z`;
      svg += `<path d="${path}" style="fill:${PALETTE[i % PALETTE.length]}" stroke="var(--surface)" stroke-width="2"><title>${esc(spec.labels[i])}: ${fmt(v, spec.unit)}</title></path>`;
      angle = end;
    });
    svg += `<text x="${cx}" y="${cy + 5}" text-anchor="middle" class="c-total">${fmt(total, spec.unit === "%" ? "" : spec.unit)}</text>`;
    spec.labels.forEach((label, i) => {
      const y = cy - (spec.labels.length * 24) / 2 + i * 24 + 12;
      const pct = Math.round((data[i] / total) * 100);
      svg += `<rect x="290" y="${y - 10}" width="12" height="12" rx="3" style="fill:${PALETTE[i % PALETTE.length]}"/><text x="310" y="${y}" class="c-label">${esc(label.length > 32 ? label.slice(0, 31) + "…" : label)}</text><text x="${W - 12}" y="${y}" text-anchor="end" class="c-value">${fmt(data[i], spec.unit)} · ${pct}%</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(spec.title)}">${svg}</svg>`;
  }

  function chartSVG(spec) {
    if (spec.type === "pie") return pieChart(spec);
    if (spec.type === "line") return lineChart(spec);
    return barChart(spec);
  }

  /** Plain text for copy / text-to-speech. */
  function toPlainText(markdown) {
    return String(markdown || "")
      .replace(/```chart[\s\S]*?```/g, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\[(\d{1,2})\]/g, "")
      .replace(/^\s*[-*•]\s+/gm, "• ")
      .replace(/^\s*\|?\s*:?-{2,}.*$/gm, "")
      .replace(/\|/g, "  ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  window.DMFTRender = { esc, renderMarkdown, tableToChart, chartSVG, toPlainText, numericColumns };
})();
