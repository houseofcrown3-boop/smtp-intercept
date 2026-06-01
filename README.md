# Auction SMTP Intercept

Webkul 경매 이메일 가로채기 + 워크플로우 엔진.

## 동작

1. Webkul이 발송하는 이메일을 SMTP로 수신
2. 원본은 차단 (수신자에 전달하지 않음)
3. 추후: 파싱 → 워크플로우 실행 → 알림(텔레그램/알리고)

## 배포

Railway에 GitHub 연결로 자동 배포. 환경변수 `PORT`는 Railway가 자동 주입.

## 로컬 테스트

```bash
npm install
npm start
```
