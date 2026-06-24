// Webkul 이메일 가로채기 SMTP 서버 + 웹 뷰어
const { SMTPServer } = require("smtp-server");
const { simpleParser } = require("mailparser");
const http = require("http");

const capturedEmails = [];
const MAX_EMAILS = 100;

// ===== SSE: 입찰 이벤트를 브라우저에 실시간 푸시 =====
const sseClients = new Set();
function broadcastBid(info) {
  const msg = `event: bid\ndata: ${JSON.stringify(info || {})}\n\n`;
  for (const res of sseClients) { try { res.write(msg); } catch (e) {} }
}
// 입찰/프록시 관련 메일인지 (전체기록·현재가 갱신이 필요한 이벤트)
function isBidEvent(email) {
  const s = (email.subject || "") + " " + (email.text || "") + " " + (email.html || "");
  return /bid placed|placed a bid|proxy amount|higher than you/i.test(s);
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// SMTP server — 항상 2525 (TCP Proxy가 여기로 라우팅)
const smtpServer = new SMTPServer({
  authOptional: true,
  hideSTARTTLS: true,
  disabledCommands: ["STARTTLS"],
  size: 10 * 1024 * 1024,
  onAuth(auth, session, callback) {
    return callback(null, { user: auth.username || "anonymous" });
  },
  onConnect(session, callback) {
    console.log(`[CONNECT] from ${session.remoteAddress}`);
    return callback();
  },
  onMailFrom(address, session, callback) {
    return callback();
  },
  onRcptTo(address, session, callback) {
    return callback();
  },
  onData(stream, session, callback) {
    simpleParser(stream, async (err, parsed) => {
      if (err) { console.error("[PARSE ERROR]", err); return callback(err); }
      const email = {
        timestamp: new Date().toISOString(),
        from: parsed.from?.text || "",
        to: parsed.to?.text || "",
        subject: parsed.subject || "(제목 없음)",
        text: parsed.text || "",
        html: parsed.html || "",
      };
      console.log(`[INTERCEPTED] ${email.subject} from ${email.from}`);
      capturedEmails.unshift(email);
      if (capturedEmails.length > MAX_EMAILS) capturedEmails.pop();
      if (isBidEvent(email)) { broadcastBid({ t: Date.now(), subject: email.subject }); }   // 입찰 메일 → 즉시 푸시
      callback();
    });
  },
});

smtpServer.on("error", (err) => { console.error("[SMTP ERROR]", err); });
smtpServer.listen(2525, "0.0.0.0", () => {
  console.log("SMTP listening on 0.0.0.0:2525");
});

// HTTP server — 웹 뷰어 (Railway PORT)
const HTTP_PORT = parseInt(process.env.PORT || "8080", 10);
const httpServer = http.createServer((req, res) => {
  if (req.url === "/api/emails") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify(capturedEmails));
  }
  // SSE 실시간 채널: 브라우저가 여기 연결 → 입찰 메일 오면 "bid" 이벤트 푸시
  if (req.url === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 3000\n");
    res.write("event: hello\ndata: {}\n\n");
    sseClients.add(res);
    const hb = setInterval(() => { try { res.write(": ping\n\n"); } catch (e) {} }, 25000);
    req.on("close", () => { clearInterval(hb); sseClients.delete(res); });
    return;
  }
  if (req.url === "/clear") {
    capturedEmails.length = 0;
    res.writeHead(302, { Location: "/" });
    return res.end();
  }

  const emailsHtml = capturedEmails.length === 0
    ? '<div class="empty">아직 가로챈 이메일이 없습니다.<br><br>Webkul에서 Test Email 보내거나 경매 이벤트를 발생시켜보세요.</div>'
    : capturedEmails.map(e => `
      <div class="email">
        <div class="subject">${escapeHtml(e.subject)}</div>
        <div class="meta">
          <div><span class="label">From:</span> ${escapeHtml(e.from)}</div>
          <div><span class="label">To:</span> ${escapeHtml(e.to)}</div>
          <div><span class="label">Time:</span> ${escapeHtml(new Date(e.timestamp).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))}</div>
        </div>
        <details>
          <summary>본문 보기</summary>
          <div class="body">${escapeHtml((e.text || "").substring(0, 3000))}</div>
        </details>
      </div>
    `).join("");

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>가로챈 이메일 - SMTP Intercept</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="10">
<style>
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro KR", sans-serif; margin: 0; padding: 24px; background: #f5f5f7; color: #1d1d1f; max-width: 900px; margin: 0 auto; }
h1 { margin: 0 0 8px; font-size: 28px; }
.subtitle { color: #86868b; margin-bottom: 24px; font-size: 14px; display: flex; justify-content: space-between; align-items: center; }
.clear-btn { background: #ff3b30; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; text-decoration: none; display: inline-block; }
.email { background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.subject { font-weight: 600; font-size: 17px; margin: 0 0 12px; color: #1d1d1f; }
.meta { color: #424245; font-size: 13px; margin-bottom: 12px; line-height: 1.7; }
.meta .label { color: #86868b; display: inline-block; min-width: 50px; }
details { margin-top: 8px; }
summary { cursor: pointer; color: #007aff; font-size: 13px; padding: 4px 0; user-select: none; }
.body { white-space: pre-wrap; font-size: 13px; line-height: 1.6; padding-top: 12px; margin-top: 8px; border-top: 1px solid #f0f0f3; max-height: 400px; overflow-y: auto; color: #1d1d1f; font-family: "SF Mono", Monaco, monospace; }
.empty { text-align: center; color: #86868b; padding: 60px 20px; background: white; border-radius: 12px; line-height: 1.6; }
</style>
</head>
<body>
<h1>📧 가로챈 이메일</h1>
<div class="subtitle">
  <span>${capturedEmails.length}개 캡처됨 · 10초마다 자동 새로고침</span>
  ${capturedEmails.length > 0 ? '<a class="clear-btn" href="/clear">전체 지우기</a>' : ''}
</div>
${emailsHtml}
</body>
</html>`;
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
});

httpServer.listen(HTTP_PORT, "0.0.0.0", () => {
  console.log(`HTTP viewer listening on 0.0.0.0:${HTTP_PORT}`);
});
