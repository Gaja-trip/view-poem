# 풍경시 (View Poem)

풍경 사진과 그 순간의 느낌을 받아 한 편의 한국어 시와 스케치 작품으로 만드는 모바일 우선 웹앱입니다. 완성 작품은 PNG로 내려받을 수 있고, Google 계정을 연결하면 지정된 Drive 폴더에 바로 저장할 수 있습니다.

## 주요 기능

- 휴대폰 카메라 촬영 또는 JPG·PNG·WEBP 업로드
- 느낌, 감정 태그, 장소, 시 길이를 반영한 한국어 시 생성
- OpenAI 이미지 편집 또는 브라우저의 로컬 연필·수채·먹선·목탄 필터
- 시와 스케치를 합친 완성 작품 PNG 다운로드
- Google Picker + `drive.file` 범위를 이용한 최소 권한 Drive 저장
- ChatGPT에서 내려받은 이미지의 별도 Drive 보관
- OpenAI/Google 설정이 없어도 로컬 스케치, 기본 시, 다운로드 후 Drive 폴더 열기로 동작하는 복구 경로

## 실행

Node.js 22.13 이상이 필요합니다.

```bash
npm install
npm run dev
```

검증 및 배포 빌드:

```bash
npm run build
npm test
```

## 환경 변수

`.env.example`을 `.env`로 복사한 뒤 필요한 값만 설정합니다. 키를 소스 코드나 브라우저 저장소에 넣지 마세요.

| 이름 | 용도 |
| --- | --- |
| `OPENAI_API_KEY` | 시와 AI 스케치 생성. 없으면 로컬 생성 경로를 사용합니다. |
| `OPENAI_TEXT_MODEL` | 기본값 `gpt-5.4-mini` |
| `OPENAI_IMAGE_MODEL` | 기본값 `gpt-image-2` |
| `GOOGLE_CLIENT_ID` | Google Identity Services 웹 클라이언트 ID |
| `GOOGLE_PICKER_API_KEY` | HTTP referrer와 Picker API로 제한한 브라우저 API 키 |
| `GOOGLE_PICKER_APP_ID` | Google Cloud 프로젝트 번호 |
| `GOOGLE_DRIVE_FOLDER_ID` | 기본 폴더 `1THA5WVItE6BFJKsOX3It7dHZQErrqc8s` |

### Google Drive 한 번에 저장 설정

1. Google Cloud 프로젝트에서 Google Drive API와 Google Picker API를 사용 설정합니다.
2. 웹 애플리케이션 OAuth 클라이언트를 만들고 로컬 및 배포 주소를 승인된 JavaScript 원본에 추가합니다.
3. 브라우저 API 키는 사용할 도메인의 HTTP referrer와 Google Picker API로 제한합니다.
4. 위 세 Google 값을 환경 변수로 설정합니다.
5. 사용자는 저장 시 Google 계정을 연결하고 처음 한 번 지정 폴더를 선택합니다. 앱은 전체 Drive가 아닌 `drive.file` 범위만 요청합니다.

Google 설정이 없으면 작품을 먼저 내려받은 다음 지정 Drive 폴더를 새 탭으로 엽니다.

## 개인정보 처리 방식

- 원본 사진을 앱의 데이터베이스나 저장소에 보관하지 않습니다.
- 브라우저에서 만든 스케치와 완성 PNG에는 원본 EXIF/GPS 메타데이터가 남지 않습니다.
- OpenAI 기능을 켠 경우에만 작품 생성을 위해 사진과 입력 문장이 OpenAI API로 전송됩니다.
- Drive 액세스 토큰은 현재 브라우저 세션에서 업로드에만 사용하며 서버나 브라우저 저장소에 저장하지 않습니다.
- 앱은 업로드한 파일에 공개 공유 권한을 만들지 않습니다.
