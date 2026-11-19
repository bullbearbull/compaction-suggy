# Compaction Suggy — ChatGPT & Claude.ai (Chrome / Edge Extension)

**ChatGPT Web (`chatgpt.com`, `chat.openai.com`)**과 **Claude Web (`claude.ai`)**에서 대화 중 **주제가 갑자기 바뀔 때** 초저지연 **Decision Model**로 즉시 감지하고, 깔끔하게 **새 대화(New Chat)** 또는 **요약 포함 새 대화(Compact Handoff)**로 넘길 수 있게 해주는 통합 Manifest V3 브라우저 확장입니다.

---

## 1. Chrome / Edge에서 바로 써보기 (로컬 로드)

1. 이 저장소 루트에서 빌드합니다(이미 빌드되어 있다면 생략 가능):
   ```bash
   npm run build
   ```
2. Chrome 주소창에 `chrome://extensions` 입력 (Edge는 `edge://extensions`)
3. 우측 상단 **개발자 모드(Developer mode)** 켜기
4. **압축해제된 확장 프로그램을 로드합니다(Load unpacked)** 클릭
5. 아래 폴더 선택:
   ```text
   /Users/jeongminwoo/.gemini/antigravity/scratch/topic-shift-compact/packages/browser-extension/dist
   ```
6. 브라우저 툴바에 **Compaction Suggy** 아이콘을 고정하고 클릭해 백엔드를 설정합니다.

---

## 2. 백엔드 연결 & API 테스트

확장 팝업에서 원하는 Decision Model 백엔드를 선택하고 **API 테스트** 버튼으로 즉시 검증할 수 있습니다. 팝업 상단의 **ChatGPT / Claude.ai** 체크박스로 사이트별 활성화를 개별 제어할 수 있습니다.

| 백엔드 | 설정값 | 비고 |
| :--- | :--- | :--- |
| **OpenRouter (Jev)** | API Key (`sk-or-v1-...`), 모델 `typesafe/jev-latest` | 가장 빠르고 간편 |
| **OpenAI (GPT-6 Luna)** | API Key (`sk-...`), 모델 `gpt-6-luna` | OpenAI Decisions API (`/v1/decisions`) |
| **Local (Ollama / vLLM)** | URL `http://localhost:11434/v1/systemone`, 모델 `tev1` | `declarativeNetRequestWithHostAccess`로 localhost `Origin` 헤더를 자동 제거해 Ollama 403 오류 방지 |

### API 키 없이 UI 동작부터 먼저 검증해 보고 싶다면? (Mock 서버)

```bash
npm run mock-server
```
- 확장 팝업 → **Local** 탭 선택
- URL: `http://localhost:11435/v1/systemone`
- API 포맷: `Ollama / System One (noul)`
- 모델명: `mock-tev1` → **API 테스트** → **설정 저장**

---

## 3. ChatGPT & Claude.ai 실사용 시나리오 테스트

1. `https://chatgpt.com` 또는 `https://claude.ai` 열기 (설치 전부터 열려 있었다면 `⌘R`로 1회 새로고침)
2. 한 주제(예: FastAPI JWT 인증 구현)로 **2턴 이상** 대화 (팝업 상단 배너에서 `ChatGPT 연결됨` / `Claude.ai 연결됨` 및 현재 턴 수 확인)
3. 완전히 다른 주제의 질문 입력 (예: `다음 달 도쿄 3박 4일 여행 일정이랑 맛집 추천해줘`) 후 `Enter` 또는 전송 버튼 클릭
4. **주제 전환 감지 모달**이 뜨며(ChatGPT는 에메랄드, Claude.ai는 테라코타 네이티브 테마 자동 적용) 3가지 선택지 제공:
   - **`1` 새 대화에서 질문하기**: 새 스레드를 열고 프롬프트를 그대로 옮김
   - **`2` 이전 대화 요약 포함해 새 대화로**: 이전 대화의 핵심 요약 블록 + 새 요청을 함께 새 스레드로 옮김
   - **`3` 현재 대화에서 그대로 전송**: 무시하고 지금 스레드에 바로 전송 (1회 자동 바이패스)
   - **`ESC`**: 취소 (입력하던 텍스트 100% 유지)

---

## 4. 정상 동작 확인 후 배포하기 (Chrome Web Store / Edge Add-ons)

```bash
npm run package:extension
```

생성 결과:
```text
release/compaction-suggy-extension-v0.1.0.zip
```

### 스토어 제출 체크리스트

1. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)에 `release/compaction-suggy-extension-v0.1.0.zip` 업로드
2. **권한 사유(Permission Justification)**:
   - `storage`: 사용자 설정(프로바이더 선택, 임계값, API 키) 및 새 대화 이동 시 임시 프롬프트 핸드오프를 브라우저 로컬(`chrome.storage.local`)에 저장하기 위해 사용.
   - `declarativeNetRequestWithHostAccess`: 로컬 Decision Model 서버(`http://localhost/*`, `http://127.0.0.1/*`) 호출 시 브라우저 자동 `Origin` 헤더로 인한 Ollama 403 차단을 방지하기 위해 `localhost` 요청에만 한정 적용.
   - `host_permissions` (`openrouter.ai`, `api.openai.com`, `localhost`, `127.0.0.1`): 사용자가 직접 선택한 Decision Model API로 백그라운드 서비스 워커에서 직접 요청을 전송하기 위해 사용.
3. **개인정보 처리(Privacy Practices)**:
   - 개발자 서버로 어떤 데이터도 수집·전송하지 않으며, API 키는 `chrome.storage.local`에만 저장됩니다.
   - 최근 대화 슬라이딩 윈도우와 새 프롬프트는 오직 사용자가 직접 설정한 Decision Model 엔드포인트로만 전송됩니다.
