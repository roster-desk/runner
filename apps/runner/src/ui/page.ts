export function runnerPage() {
  return `<!doctype html>
<meta charset="utf-8" />
<title>Roster Desk Runner</title>
<body style="font-family:sans-serif;background:#0F1216;color:#E8ECF1;padding:32px">
<h1>Roster Desk</h1>
<p id="detail">연결 준비</p>
<p id="ask" style="display:none">
  <strong id="name"></strong>
  <span id="sas" style="font-size:28px;letter-spacing:0.2em"></span>
  <button id="allow" type="button">허용</button>
  <button id="reject" type="button">거부</button>
</p>
<img id="qr" alt="" style="background:#fff;padding:12px;display:none" />
<button id="quit" type="button">종료</button>
<script>
async function tick(){
  const res = await fetch("/status");
  const data = await res.json();
  document.getElementById("detail").textContent = data.detail;
  const ask = document.getElementById("ask");
  ask.style.display = data.phase === "confirm" ? "block" : "none";
  document.getElementById("name").textContent = data.confirmName || "";
  document.getElementById("sas").textContent = data.confirmSas || "";
  const img = document.getElementById("qr");
  if (data.qr){ img.src = data.qr; img.style.display = "block"; }
  else img.style.display = "none";
}
tick();
setInterval(tick, 1000);
document.getElementById("allow").onclick = () => fetch("/pair/allow", {method:"POST"});
document.getElementById("reject").onclick = () => fetch("/pair/reject", {method:"POST"});
document.getElementById("quit").onclick = () => fetch("/quit", {method:"POST"});
</script>
</body>`;
}
