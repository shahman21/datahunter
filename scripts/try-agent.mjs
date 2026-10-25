// Drives POST /api/agent exactly as the console does and prints every event as it lands.
const base = "http://127.0.0.1:3000";
for (let i = 0; i < 90; i++) {
  try { const r = await fetch(base + "/"); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 2000));
}
const started = Date.now();
const res = await fetch(base + "/api/agent", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    goal: "Current UK planning application text, with an exclusive licence so competitors cannot buy it.",
    budgetUsdc: 0.2,
  }),
});
console.log("HTTP", res.status, res.headers.get("content-type"));
if (!res.ok) { console.log(await res.text()); process.exit(1); }
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = "", n = 0;
const types = [];
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    n++;
    const e = JSON.parse(line);
    types.push(e.type);
    const t = ((Date.now() - started) / 1000).toFixed(1).padStart(5);
    console.log(`${t}s  ${e.type.padEnd(17)} ${JSON.stringify(e).slice(0, 160)}`);
  }
}
console.log(`\n${n} events in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log("sequence:", types.join(" → "));
