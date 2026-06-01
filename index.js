// Webkul 이메일 가로채기 SMTP 서버
// 이메일을 받으면 콘솔에 출력하고 원본은 차단 (수신자에 안 보냄)

const { SMTPServer } = require("smtp-server");
const { simpleParser } = require("mailparser");

const server = new SMTPServer({
    authOptional: true,
      hideSTARTTLS: true,
      disabledCommands: ["STARTTLS"],
    size: 10 * 1024 * 1024,
    onAuth(auth, session, callback) {
          console.log(`[AUTH] user=${auth.username} method=${auth.method}`);
          return callback(null, { user: auth.username || "anonymous" });
    },
    onConnect(session, callback) {
          console.log(`[CONNECT] from ${session.remoteAddress}`);
          return callback();
    },
    onMailFrom(address, session, callback) {
          console.log(`[MAIL FROM] ${address.address}`);
          return callback();
    },
    onRcptTo(address, session, callback) {
          console.log(`[RCPT TO] ${address.address}`);
          return callback();
    },
    onData(stream, session, callback) {
          simpleParser(stream, async (err, parsed) => {
                  if (err) { console.error("[PARSE ERROR]", err); return callback(err); }
                  console.log("\n========== EMAIL INTERCEPTED ==========");
                  console.log("From:    ", parsed.from?.text);
                  console.log("To:      ", parsed.to?.text);
                  console.log("Subject: ", parsed.subject);
                  console.log("Date:    ", parsed.date);
                  console.log("--- Body (text, first 1000 chars) ---");
                  console.log((parsed.text || "").substring(0, 1000));
                  console.log("--- Body (HTML, first 500 chars) ---");
                  console.log((parsed.html || "").substring(0, 500));
                  console.log("=======================================\n");
                  callback();
          });
    },
});

server.on("error", (err) => { console.error("[SERVER ERROR]", err); });

const PORT = parseInt(process.env.PORT || "2525", 10);
server.listen(PORT, "0.0.0.0", () => {
    console.log(`SMTP intercept server listening on 0.0.0.0:${PORT}`);
});
