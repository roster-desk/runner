import { tokens } from "@rosterdesk/protocol";

/** 10.6절 화면 네 가지: QR 대기 / PC 확인 / 연결됨(에이전트·최근 승인 10건·에이전트 추가) / 연동 해제됨. */
export function runnerPage() {
  return `<!doctype html>
<html lang="ko">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Roster Desk</title>
<style>
:root { ${tokens.cssVariables("dark")} color-scheme: dark; }
@media (prefers-color-scheme: light) { :root { ${tokens.cssVariables("light")} color-scheme: light; } }
* { box-sizing: border-box; }
body { margin: 0; font: 15px/22px "Pretendard", -apple-system, "Segoe UI", sans-serif; background: var(--bg-canvas); color: var(--text-primary); }
main { max-width: 520px; margin: 0 auto; padding: var(--space-6) var(--space-4); }
header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-6); }
h1 { font-size: 20px; line-height: 26px; font-weight: 600; margin: 0; }
h2 { font-size: 17px; line-height: 22px; font-weight: 600; margin: var(--space-6) 0 var(--space-2); }
.status { display: flex; align-items: center; gap: var(--space-2); color: var(--text-secondary); font-size: 14px; }
.dot { width: 10px; height: 10px; border-radius: var(--radius-full); background: var(--text-tertiary); }
.dot.online { background: var(--state-online); } .dot.waiting { background: var(--state-waiting); } .dot.offline { background: var(--state-offline); }
.card { background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-lg); padding: var(--space-5); }
.qr { display: block; margin: var(--space-4) auto; background: #fff; padding: var(--space-3); border-radius: var(--radius-md); width: 280px; height: 280px; }
.sas { font: 600 36px/40px "JetBrains Mono", ui-monospace, monospace; letter-spacing: 0.15em; text-align: center; margin: var(--space-4) 0; }
.muted { color: var(--text-secondary); font-size: 14px; } .tiny { color: var(--text-tertiary); font-size: 12px; line-height: 16px; }
.row { display: flex; justify-content: space-between; align-items: center; padding: var(--space-3) 0; border-bottom: 1px solid var(--border-default); }
.row:last-child { border-bottom: 0; }
.actions { display: flex; gap: var(--space-2); margin-top: var(--space-4); }
button { font: 500 14px/20px inherit; min-height: 44px; padding: 0 var(--space-4); border-radius: var(--radius-md); border: 1px solid var(--border-strong); background: var(--bg-raised); color: var(--text-primary); cursor: pointer; }
button.primary { background: var(--accent-primary); border-color: var(--accent-primary); color: var(--text-onAccent); }
button.primary:active { background: var(--accent-primaryPressed); }
button.danger { color: var(--state-offline); }
input, select { width: 100%; min-height: 44px; margin: var(--space-1) 0 var(--space-3); padding: 0 var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--border-strong); background: var(--bg-raised); color: var(--text-primary); font: inherit; }
label { font-size: 12px; color: var(--text-secondary); }
.tabs { display: flex; gap: var(--space-2); margin-bottom: var(--space-3); }
.tabs button[aria-selected="true"] { border-color: var(--accent-primary); color: var(--accent-primary); }
.risk-high { color: var(--risk-high); } .risk-medium { color: var(--risk-medium); } .risk-low { color: var(--risk-low); }
[hidden] { display: none !important; }
</style>
<main>
  <header>
    <h1>Roster Desk</h1>
    <div class="status"><span class="dot" id="dot"></span><span id="detail">연결 준비</span></div>
  </header>

  <section id="screen-qr" class="card" hidden>
    <h2>폰으로 QR을 스캔하세요</h2>
    <p class="muted">Roster Desk 앱 → PC 연결 → 스캔. 이 QR에는 비밀이 없어요.</p>
    <img id="qr" class="qr" alt="페어링 QR" />
  </section>

  <section id="screen-confirm" class="card" hidden>
    <h2><span id="confirm-name"></span> 님이 연결하려고 해요</h2>
    <p class="muted">폰 화면의 숫자와 같으면 허용하세요. 다르면 거부하세요.</p>
    <div class="sas" id="sas" aria-live="polite"></div>
    <div class="actions">
      <button class="primary" id="allow" type="button">허용</button>
      <button class="danger" id="reject" type="button">거부</button>
    </div>
  </section>

  <section id="screen-online" hidden>
    <div class="card">
      <h2 style="margin-top:0">에이전트</h2>
      <div id="agents"></div>
      <p class="tiny" id="no-agents" hidden>아직 없어요. 아래에서 추가하세요.</p>
    </div>
    <div class="card" style="margin-top: var(--space-4)">
      <h2 style="margin-top:0">최근 승인</h2>
      <div id="approvals"></div>
      <p class="tiny" id="no-approvals">아직 없어요.</p>
    </div>
    <div class="card" style="margin-top: var(--space-4)">
      <h2 style="margin-top:0">에이전트 추가</h2>
      <div class="tabs" role="tablist">
        <button type="button" role="tab" id="tab-template" aria-selected="true">템플릿</button>
        <button type="button" role="tab" id="tab-http" aria-selected="false">웹훅(n8n·Make)</button>
      </div>
      <form id="form-template">
        <label for="template">템플릿</label>
        <select id="template"></select>
        <label for="cwd">작업 폴더</label>
        <input id="cwd" placeholder="~/dev/my-repo" />
        <button class="primary" type="submit">추가</button>
      </form>
      <form id="form-http" hidden>
        <label for="http-name">이름</label>
        <input id="http-name" maxlength="40" placeholder="주간 보고 봇" />
        <label for="http-id">ID (소문자·숫자·하이픈)</label>
        <input id="http-id" maxlength="40" placeholder="weekly-report" />
        <label for="http-url">웹훅 주소</label>
        <input id="http-url" placeholder="https://n8n.example.com/webhook/..." />
        <button class="primary" type="submit">추가</button>
      </form>
      <p class="muted" id="add-result" aria-live="polite"></p>
    </div>
  </section>

  <section id="screen-revoked" class="card" hidden>
    <h2>PC 연동이 해제됐어요</h2>
    <p class="muted">폰에서 다시 연결하려면 Runner를 다시 켜고 QR을 스캔하세요.</p>
  </section>

  <div class="actions"><button type="button" id="quit">Runner 끄기</button></div>
</main>
<script>
const token = new URLSearchParams(location.search).get("t") || "";
const api = (path, body) => fetch(path, {
  method: body ? "POST" : "GET",
  headers: { "x-rd-token": token, "content-type": "application/json" },
  body: body ? JSON.stringify(body) : undefined,
}).then((res) => res.json());
const $ = (id) => document.getElementById(id);
const SCREENS = { qr: "qr", expired: "qr", starting: "qr", confirm: "confirm", online: "online", offline: "online", revoked: "revoked" };
const DOT = { online: "online", confirm: "waiting", qr: "waiting", offline: "offline", revoked: "offline" };

function row(left, right, rightClass) {
  const div = document.createElement("div");
  div.className = "row";
  const a = document.createElement("span"); a.textContent = left;
  const b = document.createElement("span"); b.textContent = right; b.className = rightClass || "tiny";
  div.append(a, b);
  return div;
}

async function tick() {
  const s = await api("/api/status");
  $("detail").textContent = s.detail;
  $("dot").className = "dot " + (DOT[s.phase] || "");
  for (const name of ["qr", "confirm", "online", "revoked"]) $("screen-" + name).hidden = SCREENS[s.phase] !== name;
  if (s.qr) $("qr").src = s.qr;
  $("confirm-name").textContent = s.confirmName || "";
  $("sas").textContent = (s.confirmSas || "").replace(/(\\d{3})(\\d{3})/, "$1 $2");
  $("agents").replaceChildren(...s.agents.map((a) => row(a.name, a.adapterKind)));
  $("no-agents").hidden = s.agents.length > 0;
  $("approvals").replaceChildren(...s.approvals.map((r) => row(r.agentId + " · " + r.toolName, r.outcome, "risk-" + r.risk)));
  $("no-approvals").hidden = s.approvals.length > 0;
}

async function loadTemplates() {
  const { templates } = await api("/api/templates");
  $("template").replaceChildren(...templates.map((t) => {
    const o = document.createElement("option"); o.value = t.id; o.textContent = t.name + " — " + t.description; o.dataset.cwd = t.defaultCwd; return o;
  }));
  $("cwd").placeholder = templates[0]?.defaultCwd || "";
}

function tab(which) {
  $("tab-template").setAttribute("aria-selected", String(which === "template"));
  $("tab-http").setAttribute("aria-selected", String(which === "http"));
  $("form-template").hidden = which !== "template";
  $("form-http").hidden = which !== "http";
}

$("tab-template").onclick = () => tab("template");
$("tab-http").onclick = () => tab("http");
$("template").onchange = (e) => { $("cwd").placeholder = e.target.selectedOptions[0]?.dataset.cwd || ""; };
$("form-template").onsubmit = async (e) => {
  e.preventDefault();
  const r = await api("/api/agents/template", { templateId: $("template").value, cwd: $("cwd").value || $("cwd").placeholder });
  $("add-result").textContent = r.message;
};
$("form-http").onsubmit = async (e) => {
  e.preventDefault();
  const r = await api("/api/agents/http", { id: $("http-id").value.trim(), name: $("http-name").value.trim(), url: $("http-url").value.trim() });
  $("add-result").textContent = r.message;
};
$("allow").onclick = () => api("/api/pair", { decision: "allow" });
$("reject").onclick = () => api("/api/pair", { decision: "reject" });
$("quit").onclick = () => api("/api/quit", {});
tick(); loadTemplates();
setInterval(tick, 1000);
</script>
</html>`;
}
