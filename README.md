# CheckOn - 사업자 신뢰도 종합 조회 시스템

여러 공공 데이터를 한 번에 조회하여 사업자 정보를 종합적으로 확인할 수 있는 도구입니다.

## 핵심 기능

### 교차 검증 기반의 신뢰도 평가

**데이터 파이프라인 전략:** 공정위(기준점) → 국세청(검증) → 특허청(가치)

```
┌─────────────────────────────────────────────────────────────────┐
│                     CheckOn 데이터 파이프라인                      │
└─────────────────────────────────────────────────────────────────┘

STEP 1: 공정위 (FTC) - 기준점 데이터 소스
┌────────────────────────────────────────┐
│ • 상호 (회사명)                         │
│ • 대표자명                              │
│ • 주소                                  │
│ • 통신판매업 신고 여부 & 신고번호      │
│ • 공식 웹사이트 정보                    │
│ • 업태 및 종목                          │
└────────────────────────────────────────┘
                    ↓
        (출원인 검증 필터링 적용)
                    ↓
STEP 2: 국세청 (NTS) - 검증 데이터
┌────────────────────────────────────────┐
│ • 사업자 상태 (계속/폐업)              │
│ • 과세 유형 (일반/간이 등)             │
│ • 세금계산서 발행 가능 여부             │
│ • 개업일 정보                           │
└────────────────────────────────────────┘
                    ↓
        (FTC 정보로 검증된 사업자 기준)
                    ↓
STEP 3: 특허청 (KIPRIS) - 가치 검증
┌────────────────────────────────────────┐
│ • 상표권 등록 여부 (출원인 일치)       │
│ • 특허·실용공보 등재 (출원인 일치)    │
│ • 상표 행정처리 이력                    │
│ → False Positive 방지: 출원인 필터링 적용
└────────────────────────────────────────┘
                    ↓
        ┌───────────────────────┐
        │   신뢰 근거 종합      │
        │  (점수 아님)          │
        └───────────────────────┘
```

### 신뢰 평가 기준

**신뢰할 수 있는 근거:**
1. **국세청 검증** - 사업자등록번호 확인 및 상태 확인
   - 계속사업자 상태인 경우 정상 운영 중
   - 과세 유형 및 세금 정보 확인 가능

2. **공정위 등록 확인** - 통신판매업 신고 완료
   - 온라인 거래 신고 완료 시 일정 수준의 신뢰도 확보
   - 신고번호 확인 가능

3. **지식재산권 보유** - 특허/상표 등록
   - 해당 업체가 출원한 지식재산권 보유 시 사업 신뢰도 상향
   - **출원인 일치 여부를 엄격히 검증** (False Positive 방지)

#### 1. 공정위 API (1차 - 기준점 데이터)
- 상호, 대표자, 주소 등 기본 정보 수집
- 통신판매업 신고 여부 및 신고번호 확인
- 공식 웹사이트 정보 수집
- **역할:** 이후 데이터 검증의 기준점 제공

#### 2. 국세청 API (2차 - 검증)
- 사업자등록번호 유효성 검증
- 사업자 상태 (계속사업자/폐업자) 확인
- 과세 유형 및 세금계산서 발행 가능 여부 확인
- **역할:** 공정위 정보의 유효성 검증

#### 3. 특허청 API (3차 - 가치 검증)
- 출원인이 조회 대상 회사와 일치하는 상표 검색
- 출원인이 조회 대상 회사와 일치하는 특허·실용 검색
- 상표 행정처리 이력 확인
- **역할:** 회사의 지식재산권 보유로 신뢰도 추가 검증
- **필터링:** 출원인 일치 여부를 엄격히 검증하여 False Positive 방지

## 기술 스택

### Frontend
- **Framework**: Next.js 16.0.5
- **UI**: React 19.2.0 + TypeScript 5
- **Styling**: Tailwind CSS 4
- **Analytics**: Google Analytics

### Backend
- **Runtime**: Node.js (Next.js API Routes)
- **API Protocol**: RESTful
- **Data Sources**: 공공 데이터 포털 Open API

### Public APIs 통합
- **공정위**: 전자상거래 업체 정보 API
- **국세청**: 사업자 상태 조회 API (`nts-businessman/v1/status`)
- **특허청 KIPRIS**: 
  - 상표 워드 검색 API
  - 특허·실용 워드 검색 API
  - 상표 행정처리 이력 API

## 프로젝트 구조

```
ksnu-checkon/
├── app/
│   ├── api/
│   │   ├── analyze/
│   │   │   └── route.ts              # 메인 분석 엔드포인트
│   │   │                              # - 데이터 파이프라인 구현
│   │   │                              # - 출원인 필터링 로직
│   │   │                              # - 교차 검증 로직
│   │   ├── sample/
│   │   │   └── route.ts              # API 연동 상태 테스트
│   │   └── test/
│   │       └── route.ts              # 테스트 헬퍼
│   ├── debug/
│   │   └── page.tsx                  # API 상태 확인 페이지
│   ├── page.tsx                      # 메인 검색 페이지
│   ├── layout.tsx                    # 루트 레이아웃
│   ├── globals.css                   # 전역 스타일
│   └── page-old.tsx                  # 이전 버전 백업
├── lib/
│   └── ga.ts                         # Google Analytics 통합
├── public/                           # 정적 리소스
├── package.json                      # 프로젝트 의존성
├── tsconfig.json                     # TypeScript 설정
├── next.config.ts                    # Next.js 설정
├── tailwind.config.ts                # Tailwind 설정
├── postcss.config.mjs                # PostCSS 설정
├── eslint.config.mjs                 # ESLint 설정
└── README.md                         # 프로젝트 문서
```

## 시작하기

### 사전 요구사항

- Node.js 18+
- npm 9+ 또는 yarn 4+

### 환경 설정

`.env.local` 파일 생성 후 다음 환경 변수 설정:

```bash
# 공정위 API 키 (필수)
# 출처: https://www.data.go.kr/
FTC_API_KEY=your_ftc_api_key

# 국세청 API 키 (필수)
# 출처: https://www.data.go.kr/
NTS_API_KEY=your_nts_api_key

# 특허청 KIPRIS API 키 (필수)
# 출처: https://www.kipris.or.kr/
KIPRIS_API_KEY=your_kipris_api_key

# Google Analytics (선택)
NEXT_PUBLIC_GA_ID=G-R9DFYNXWGN

# 개발 환경용 Mock 모드 (선택)
USE_MOCK_NTS=false
USE_MOCK_KIPRIS=false
```

### 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 시작 (핫 리로드 활성화)
npm run dev

# 프로덕션 빌드
npm run build

# 프로덕션 서버 시작
npm start

# 린트 검사
npm run lint
```

브라우저에서 `http://localhost:3000` 접속 후 사업자등록번호 입력

## 🔗 API 엔드포인트

### `/api/analyze` (POST)

사업자 정보를 공정위 → 국세청 → 특허청 순서로 종합 조회합니다.

**Request**
```json
{
  "bizNumber": "1248100998"
}
```

**Response**
```json
{
  "success": true,
  "data": {
    "businessInfo": {
      "bizNumber": "1248100998",
      "corpName": "회사명",
      "representative": "대표자명",
      "address": "주소",
      "ntsStatus": "계속사업자",
      "taxType": "일반",
      "ftcNumber": "신고번호"
    },
    "summary": "신뢰 근거 상세 정보",
    "bizStatus": "국세청 상태 정보",
    "onlineLicense": "공정위 등록 정보",
    "brandRight": "특허청 자산 정보",
    "sources": {
      "nts": { "status": "OK", "message": "계속사업자" },
      "ftc": { "status": "OK", "message": "등록됨" },
      "kiprisTrademark": { "status": "OK", "message": "상표정보" },
      "kiprisPatent": { "status": "NotFound", "message": "특허없음" },
      "kiprisTmHistory": { "status": "OK", "message": "이력정보" }
    }
  }
}
```

### `/debug` (GET)

API 연동 상태 및 테스트 페이지입니다.

## 테스트

### API 상태 확인
```bash
curl http://localhost:3000/debug
```

### 실제 조회 테스트
```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"bizNumber": "1248100998"}'
```

### 테스트 사업자등록번호
- 1248100998 (삼성전자)
- 2048300109 (LG전자)

## 클린 코드 원칙 적용

### 적용된 원칙

1. **의도를 분명히 밝혀라** (Meaningful Names)
   - 변수: `inputBusinessNumber`, `isAnalysisLoading` 등
   - 함수: `isApplicantMatching()`, `generateTrustReasonsSummary()` 등

2. **조건을 캡슐화하라** (Condition Encapsulation)
   - `isApplicantMatching()`: 출원인 일치 여부 판단
   - `isGoogleAnalyticsAvailable()`: GA 사용 가능 여부 판단

3. **명령과 조회를 분리하라** (CQS Principle)
   - 조회: `fetchCompanyDetailsFromFTC()`, `isApplicantMatching()`
   - 명령: `mergeCompanyInfoWithFTCData()`, `logEvent()`

4. **함수는 한 가지만 해야 한다** (Single Responsibility)
   - 25+ UI 컴포넌트 각각 단일 책임
   - 20+ 유틸리티 함수 각각 단일 목적

## 보안

- ✅ API 키는 환경 변수로 관리 (클라이언트 노출 없음)
- ✅ 서버사이드 API 호출로 민감 정보 보호
- ✅ 입력값 검증 및 정규화 (e.g., 사업자번호 하이픈 제거)
- ✅ API 요청 타임아웃 설정 (15초)
- ✅ XML 파싱시 안전한 태그 추출
- ✅ 출원인 필터링으로 False Positive 방지

## 개선 사항

### v1.1.0 (현재)
- ✅ 출원인 일치 여부를 통한 엄격한 특허/상표 필터링
- ✅ 신뢰도 점수 시스템 비활성화
- ✅ 구체적인 신뢰 근거 제공 로직 추가
- ✅ 데이터 파이프라인 전략 명확화 (FTC → NTS → KIPRIS)
- ✅ 클린 코드 원칙 전사 적용

### 향후 계획
- [ ] 캐싱 시스템 추가 (Redis)
- [ ] 배치 조회 API 추가
- [ ] 신뢰도 인증 시스템 고도화
- [ ] 다중 계정 관리 기능
- [ ] 조회 이력 관리

## 문제 해결

### API 연동 오류
1. `/debug` 페이지에서 각 API 상태 확인
2. 환경 변수 설정 확인 (`.env.local`)
3. 공공 데이터 포털에서 API 활성화 상태 확인
4. 서버 로그 검토

### 특정 사업자 조회 불가
- 공정위 미등록 사업자인 경우
- 국세청 폐업 사업자인 경우
- 입력 사업자번호 오류 확인

## 지원

문제 발생 시:
1. 로컬 개발 서버에서 `/debug` 페이지 확인
2. 브라우저 개발자 도구에서 네트워크 탭 확인
3. 서버 콘솔 로그에서 API 응답 상태 확인
