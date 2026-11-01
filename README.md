# BizDrive 운행기록부 — 휴대폰 변환 페이지

차량용 앱 BizDrive(Pleos Connect)의 **내보내기 QR** 을 휴대폰으로 찍으면 열리는 정적 페이지입니다.
QR 에 담긴 한 달 운행기록을 국세청 「업무용승용차 운행기록부」 서식으로 보여 주고, 엑셀(CSV)·PDF 로 받게 합니다.

- 주소: https://mongmulab.github.io/bizdrive-web/
- 데이터는 주소의 `#` 뒤에만 실려 서버로 가지 않습니다. 읽은 뒤에는 주소창에서 지웁니다.
- 받은 달은 그 휴대폰 브라우저(localStorage)에만 보관하고, 사업연도 단위로 합쳐 받을 수 있습니다.
- 외부 스크립트·글꼴·분석 도구를 쓰지 않습니다. 압축 해제는 브라우저 내장 `DecompressionStream("deflate-raw")` 를 씁니다.

## 형식

`QrPayloadCodec` v1 = base64url(raw-deflate(본문)). 본문 칸 순서는 `ledger.js` 머리 주석과 앱 저장소의
`core/.../export/QrPayloadCodec.kt` 에 있습니다. 앱과 이 페이지는 같은 시험 글자(`test/ledger.test.mjs` 의 `VECTOR`)를
양쪽에서 풀어 형식이 어긋나지 않게 맞춥니다.

## 시험

```
node --test test
```

이 저장소는 앱 저장소의 `web/` 폴더에서 내보낸 사본입니다. 고칠 때는 앱 저장소에서 고칩니다.
