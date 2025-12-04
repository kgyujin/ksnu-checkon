'use client';

import { useState } from 'react';
import { logEvent } from '../lib/ga';

/**
 * CheckOn - 사업자 신뢰도 종합 조회 시스템
 * 
 * 공정위(기업정보) → 국세청(상태검증) → 특허청(가치) 파이프라인 기반
 * 교차 검증을 통한 신뢰도 있는 사업자 정보 제공
 */
export default function CheckOnPage() {
  const [inputBusinessNumber, setInputBusinessNumber] = useState('');
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
  const [currentLoadingStep, setCurrentLoadingStep] = useState(0);
  const [expandedDetailSection, setExpandedDetailSection] = useState({
    nts: false,
    ftc: false,
    tm: false,
    kiprisExtra: false,
  });

  const loadingSteps = [
    '공정위 기업 정보 확인 중...',
    '국세청 사업자 상태 확인 중...',
    '특허청 상표권 정보 확인 중...',
    '종합 신뢰도 점수 산출 중...'
  ];

  const handleSubmitBusinessNumberForm = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const cleanedBusinessNumber = inputBusinessNumber.trim();
    if (!cleanedBusinessNumber) {
      alert('사업자등록번호를 입력해주세요.');
      return;
    }

    recordBusinessLookupInitiation(cleanedBusinessNumber);
    await performBusinessAnalysis(cleanedBusinessNumber);
  };

  async function performBusinessAnalysis(bizNumber: string): Promise<void> {
    setIsAnalysisLoading(true);
    setAnalysisResult(null);
    setCurrentLoadingStep(0);

    const stepAnimationInterval = setInterval(() => {
      setCurrentLoadingStep((prevStep) => {
        const nextStep = prevStep + 1;
        if (nextStep >= loadingSteps.length) {
          return prevStep;
        }
        return nextStep;
      });
    }, 1500);

    try {
      const analysisData = await fetchBusinessAnalysisFromServer(bizNumber);
      setAnalysisResult(analysisData.data);
      recordBusinessLookupSuccess(bizNumber);
    } catch (error) {
      alert('조회 중 오류가 발생했습니다.');
      console.error(error);
      recordBusinessLookupError(bizNumber);
    } finally {
      clearInterval(stepAnimationInterval);
      setIsAnalysisLoading(false);
    }
  }

  async function fetchBusinessAnalysisFromServer(bizNumber: string): Promise<any> {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bizNumber: bizNumber }),
    });

    return response.json();
  }

  function recordBusinessLookupInitiation(bizNumber: string): void {
    logEvent({
      action: 'check_submit',
      category: 'business_lookup',
      label: bizNumber,
    });
  }

  function recordBusinessLookupSuccess(bizNumber: string): void {
    logEvent({
      action: 'check_success',
      category: 'business_lookup',
      label: bizNumber,
    });
  }

  function recordBusinessLookupError(bizNumber: string): void {
    logEvent({
      action: 'check_error',
      category: 'business_lookup',
      label: bizNumber,
    });
  }

  return (
    <main className="min-h-screen bg-slate-50 pt-12 pb-20 px-4">
      <HeaderSection />
      <SearchForm
        inputValue={inputBusinessNumber}
        onInputChange={setInputBusinessNumber}
        onSubmit={handleSubmitBusinessNumberForm}
        isLoading={isAnalysisLoading}
        currentLoadingStepText={loadingSteps[currentLoadingStep]}
      />
      {analysisResult && !isAnalysisLoading && (
        <ResultSection 
          data={analysisResult}
          expandedSections={expandedDetailSection}
          onToggleSection={(section) =>
            setExpandedDetailSection((prev) => ({ ...prev, [section]: !prev[section] }))
          }
        />
      )}
    </main>
  );
}

// ======================================================================
// UI 컴포넌트 - 각 컴포넌트는 단일 책임
// ======================================================================

function HeaderSection() {
  return (
    <div className="max-w-3xl mx-auto text-center mb-8">
      <h1 className="text-4xl font-black text-slate-900 mb-2 flex items-center justify-center gap-3">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md">
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="w-6 h-6"
          >
            <rect x="3" y="4" width="18" height="16" rx="4" ry="4" fill="currentColor" opacity="0.12" />
            <path
              d="M8.5 12.5L11 15l4.5-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx="12"
              cy="12"
              r="7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span>CheckOn</span>
      </h1>
      <p className="text-base md:text-lg text-slate-500">
        이 쇼핑몰, 믿고 사도 될까? 1초 만에 확인하기
      </p>
    </div>
  );
}

interface SearchFormProps {
  inputValue: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  currentLoadingStepText: string;
}

function SearchForm({
  inputValue,
  onInputChange,
  onSubmit,
  isLoading,
  currentLoadingStepText
}: SearchFormProps) {
  return (
    <div className="max-w-xl mx-auto mb-12">
      <form
        onSubmit={onSubmit}
        className="relative bg-white rounded-full shadow-[0_1px_6px_rgba(32,33,36,0.28)]"
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="사업자등록번호 (예: 1248100998)"
          className="w-full px-6 py-4 text-lg bg-white border border-transparent rounded-full focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-8 rounded-full font-bold transition-all"
        >
          {isLoading ? currentLoadingStepText : '조회'}
        </button>
      </form>
    </div>
  );
}

interface ResultSectionProps {
  data: any;
  expandedSections: Record<string, boolean>;
  onToggleSection: (section: string) => void;
}

function ResultSection({ data, expandedSections, onToggleSection }: ResultSectionProps) {
  return (
    <div className="max-w-3xl mx-auto animate-fade-in-up space-y-6">
      <CompanyProfileCard data={data} />
      <CompanyDetailsGrid data={data} />
      {(data.sources?.kiprisPatent || data.sources?.kiprisTmHistory) && (
        <IPAssetsSummaryGrid data={data} />
      )}
      {data.sources && (
        <RawDataSection 
          data={data.sources}
          expandedSections={expandedSections}
          onToggleSection={onToggleSection}
        />
      )}
      <Footer />
    </div>
  );
}
          
          {/* 1. 메인 카드 - 회사 정보 + 신뢰도 */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
            <div className="p-8">
              <div className="flex flex-col gap-6 mb-6">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div className="flex-1">
                  {/* 상태 배지들 */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {result.businessInfo?.ntsStatus && (
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        result.businessInfo.ntsStatus.includes('계속')
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {result.businessInfo.ntsStatus}
                      </span>
                    )}
                    {result.businessInfo?.taxType && (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                        {result.businessInfo.taxType}
                      </span>
                    )}
                  </div>

                  {/* 회사명 */}
                  <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-2">
                    {result.businessInfo?.corpName || '회사명 정보 없음'}
                  </h2>

                  {/* 주소 */}
                  {result.businessInfo?.address && (
                    <div className="mb-4">
                      <div className="flex items-start gap-2">
                        <span className="mt-1 inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 text-blue-600">
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            className="w-4 h-4"
                          >
                            <path
                              d="M12 3.5C9.24 3.5 7 5.74 7 8.5c0 3.77 4.12 7.85 4.86 8.54.07.07.17.11.27.11s.2-.04.27-.11C12.88 16.35 17 12.27 17 8.5 17 5.74 14.76 3.5 12 3.5z"
                              fill="currentColor"
                              opacity="0.15"
                            />
                            <path
                              d="M12 3.5C9.24 3.5 7 5.74 7 8.5c0 3.77 4.12 7.85 4.86 8.54.07.07.17.11.27.11s.2-.04.27-.11C12.88 16.35 17 12.27 17 8.5 17 5.74 14.76 3.5 12 3.5z"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            />
                            <circle
                              cx="12"
                              cy="8.5"
                              r="1.8"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.4"
                            />
                          </svg>
                        </span>
                        <p className="text-slate-600 text-base md:text-lg">
                          {result.businessInfo.address}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 대표자 및 기본 정보 */}
                  <div className="flex flex-wrap gap-6 text-sm md:text-base">
                    {result.businessInfo?.representative && (
                      <div>
                        <span className="text-slate-500">대표자</span>
                        <p className="font-bold text-slate-900">{result.businessInfo.representative}</p>
                      </div>
                    )}
                    {result.businessInfo?.bizNumber && (
                      <div>
                        <span className="text-slate-500">사업자등록번호</span>
                        <p className="font-bold text-slate-900 font-mono">{result.businessInfo.bizNumber}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 신뢰도 점수 박스 */}
                <div className="md:w-64 flex-shrink-0 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 md:p-8 border border-blue-200 flex flex-col justify-between self-start">
                  <div className="text-center">
                    <div className="text-xs md:text-sm text-slate-600 font-bold mb-1 md:mb-2">
                      신뢰도 점수
                    </div>
                    <div className="text-4xl md:text-5xl font-black text-blue-600">
                      {result.safetyScore?.score || 0}
                    </div>
                    <div className="text-[11px] md:text-xs text-slate-500 mt-1 md:mt-2">
                      / 100점
                    </div>
                  </div>
                  {/* 점수 구성 */}
                  <div className="mt-4 md:mt-6 space-y-1.5 text-[11px] md:text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>국세청</span>
                      <span className="font-bold">
                        {result.safetyScore?.breakdown?.nts || 0}점
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>공정위</span>
                      <span className="font-bold">
                        {result.safetyScore?.breakdown?.ftc || 0}점
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>특허청</span>
                      <span className="font-bold">
                        {result.safetyScore?.breakdown?.kipris || 0}점
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 md:mt-4 text-[10px] md:text-[11px] text-slate-500 text-left space-y-0.5">
                    <p className="font-semibold text-slate-600">참고 링크</p>
                    {result.businessInfo?.domain && result.businessInfo.domain.length > 0 ? (
                      result.businessInfo.domain.slice(0, 2).map((url: string, idx: number) => (
                        <p key={idx}>
                          •{' '}
                          <a
                            href={url.startsWith('http') ? url : `https://${url}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline break-all"
                          >
                            {url}
                          </a>
                        </p>
                      ))
                    ) : (
                      <p>• 참고할 수 있는 공식 웹사이트 정보가 없습니다.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* 지도 */}
              {result.businessInfo?.address && (
                <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm h-56">
                  <iframe
                    title="사업자 위치 지도"
                    src={`https://www.google.com/maps?q=${encodeURIComponent(
                      result.businessInfo.address
                    )}&output=embed`}
                    className="w-full h-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              )}
              </div>

              {/* 기업 정보 요약 */}
              <div className="mt-8 bg-slate-50 rounded-xl p-6 border border-slate-200">
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 text-slate-50">
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className="w-4 h-4"
                    >
                      <rect
                        x="6.5"
                        y="4.5"
                        width="11"
                        height="15"
                        rx="1.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                      />
                      <path
                        d="M9 8.5h6M9 11h6M9 13.5h4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  <span className="font-bold text-slate-900">기업 정보 요약</span>
                </div>
                <p className="text-slate-700 leading-relaxed whitespace-pre-line text-sm md:text-base">
                  {result.summary}
                </p>
              </div>
            </div>
          </div>

          {/* 2. 상세 정보 그리드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* 전자상거래 정보 */}
            <div className="bg-white rounded-xl shadow-md border border-slate-100 p-6 text-sm md:text-base">
              <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2 text-lg">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-50 text-emerald-600">
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="w-4 h-4"
                  >
                    <path
                      d="M4 5.5h2.2c.4 0 .75.27.86.65L8.5 12h8.3c.4 0 .74.27.85.65l.8 3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="10" cy="18" r="1.3" fill="currentColor" />
                    <circle cx="16" cy="18" r="1.3" fill="currentColor" />
                  </svg>
                </span>
                <span>전자상거래 자격</span>
              </h3>
              <dl className="space-y-4">
                <div className="flex justify-between items-center">
                  <dt className="text-slate-600">통신판매업 신고</dt>
                  <dd
                    className={`font-bold ${
                    result.onlineLicense?.includes('확인')
                      ? 'text-green-600'
                      : 'text-slate-400'
                    }`}
                  >
                    {result.onlineLicense?.includes('확인')
                      ? '신고 완료'
                      : '미신고 또는 확인 불가'}
                  </dd>
                </div>
                {result.businessInfo?.ftcNumber && (
                  <div className="flex justify-between items-start">
                    <dt className="text-slate-600">신고번호</dt>
                    <dd className="font-mono text-sm text-slate-900">{result.businessInfo.ftcNumber}</dd>
                  </div>
                )}
                {result.businessInfo?.domain && result.businessInfo.domain.length > 0 && (
                  <div className="flex justify-between items-start">
                    <dt className="text-slate-600">공식 웹사이트</dt>
                    <dd className="text-right">
                      {result.businessInfo.domain.map((url: string, idx: number) => (
                        <div key={idx}>
                          <a
                            href={url.startsWith('http') ? url : `https://${url}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:underline text-sm break-all"
                          >
                            {url}
                          </a>
                        </div>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* 세무 정보 */}
            <div className="bg-white rounded-xl shadow-md border border-slate-100 p-6 text-sm md:text-base">
              <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2 text-lg">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-50 text-amber-600">
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="w-4 h-4"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M9.5 10.2C9.8 9.5 10.6 9 11.7 9c1.3 0 2.1.6 2.1 1.6 0 1-0.8 1.5-2.1 1.7-1.1.2-1.9.7-1.9 1.7 0 1 .8 1.6 2 1.6 1 0 1.7-.4 2-.9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                    <path
                      d="M12 7.5v9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span>세무 정보</span>
              </h3>
              <dl className="space-y-4">
                  <div className="flex justify-between items-center">
                    <dt className="text-slate-600">개업일자</dt>
                  <dd className="font-medium text-slate-900">
                    {result.businessInfo?.startDt || '정보 없음'}
                  </dd>
                  </div>
                  <div className="flex justify-between items-center">
                    <dt className="text-slate-600">과세 유형</dt>
                  <dd className="font-medium text-slate-900">
                    {result.businessInfo?.taxType || '정보 없음'}
                  </dd>
                  </div>
                  <div className="flex justify-between items-center">
                    <dt className="text-slate-600">세금계산서</dt>
                  <dd
                    className={`font-bold ${
                      result.businessInfo?.utccYn === '가능'
                        ? 'text-green-600'
                        : 'text-slate-400'
                    }`}
                  >
                    {result.businessInfo?.utccYn === '가능'
                      ? '발행 가능 (국세청 정보 기준)'
                      : '발행 불가 또는 확인 불가 (국세청 정보 기준)'}
                    </dd>
                  </div>
              </dl>
            </div>

            {/* 업종 정보 */}
            {(result.businessInfo?.bizType || result.businessInfo?.bizItem) && (
              <div className="bg-white rounded-xl shadow-md border border-slate-100 p-6 text-sm md:text-base">
                <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2 text-lg">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-50 text-indigo-600">
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className="w-4 h-4"
                    >
                      <path
                        d="M6.5 17.5V11M12 17.5v-5M17.5 17.5v-8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                      <path
                        d="M5 17.5h14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  <span>업종 정보</span>
                </h3>
                <dl className="space-y-4">
                  {result.businessInfo?.bizType && (
                    <div>
                      <dt className="text-slate-600 text-sm">업태</dt>
                      <dd className="font-medium text-slate-900">{result.businessInfo.bizType}</dd>
                    </div>
                  )}
                  {result.businessInfo?.bizItem && (
                    <div>
                      <dt className="text-slate-600 text-sm">주요 품목</dt>
                      <dd className="font-medium text-slate-900">{result.businessInfo.bizItem}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* 상표권 정보 */}
            <div className="bg-white rounded-xl shadow-md border border-slate-100 p-6 text-sm md:text-base">
              <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2 text-lg">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-rose-50 text-rose-600">
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="w-4 h-4"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M10 15.2V8.8h2.3c1.3 0 2.1.7 2.1 1.9 0 1.2-.9 1.9-2.1 1.9H10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M11.9 12.5 14 15.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span>상표권 정보</span>
              </h3>
              <p className="text-slate-700 text-sm md:text-base leading-relaxed whitespace-pre-line">
                {result.brandRight || '자동 상표권 조회 기능은 현재 준비 중입니다. 특허청 KIPRIS에서 직접 상표권 등록 여부를 확인해 주세요.'}
              </p>
            </div>
          </div>

          {/* 3. 특허·실용 및 상표 이력 요약 */}
          {(result.sources?.kiprisPatent || result.sources?.kiprisTmHistory) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {result.sources?.kiprisPatent && (
                <div className="bg-white rounded-xl shadow-md border border-slate-100 p-6">
                  <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2 text-lg">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-sky-50 text-sky-600">
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        className="w-4 h-4"
                      >
                        <rect
                          x="6.5"
                          y="5.5"
                          width="11"
                          height="13"
                          rx="1.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                        />
                        <path
                          d="M9 9.5h6M9 12h4.5M9 14.5h3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <span>특허·실용 공보 요약</span>
                  </h3>
                  <p className="text-sm md:text-base text-slate-700 leading-relaxed whitespace-pre-line">
                    {result.sources.kiprisPatent.message}
                  </p>
                </div>
              )}
              {result.sources?.kiprisTmHistory && (
                <div className="bg-white rounded-xl shadow-md border border-slate-100 p-6">
                  <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2 text-lg">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-50 text-slate-600">
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        className="w-4 h-4"
                      >
                        <rect
                          x="6.5"
                          y="4.5"
                          width="11"
                          height="15"
                          rx="1.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                        />
                        <path
                          d="M9 9h6M9 11.8h6M9 14.6h4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <span>상표 행정처리 이력 요약</span>
                  </h3>
                  <p className="text-sm md:text-base text-slate-700 leading-relaxed whitespace-pre-line">
                    {result.sources.kiprisTmHistory.message}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 4. 공공데이터 상세 정보 */}
          {result.sources && (
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
              <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2 text-lg">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 text-slate-50">
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="w-4 h-4"
                  >
                    <rect
                      x="4.2"
                      y="6.5"
                      width="15.6"
                      height="11"
                      rx="2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M5.5 9.5h5.2l1-1.8h6.8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span>공공데이터 상세 정보</span>
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                공공 데이터 포털(Open API)에서 조회한 원본 응답을 한눈에 확인할 수 있습니다.
              </p>
              <div className="space-y-3 text-xs font-mono">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-2 text-left font-bold text-slate-800"
                    onClick={() =>
                      setOpenDetails((prev) => ({ ...prev, nts: !prev.nts }))
                    }
                  >
                    <span className="flex items-center gap-2">
                      <span>국세청 (NTS)</span>
                    </span>
                    <span
                      className={`transition-transform ${
                        openDetails.nts ? 'rotate-90' : ''
                      }`}
                    >
                      <svg
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                        className="w-3.5 h-3.5 text-slate-500"
                      >
                        <path
                          d="M7 5l6 5-6 5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>
                  {openDetails.nts && (
                    <div className="mt-2 max-h-72 overflow-auto border-t border-slate-200 pt-2">
                      <pre className="whitespace-pre-wrap break-all">
                        {JSON.stringify(result.sources.nts, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-2 text-left font-bold text-slate-800"
                    onClick={() =>
                      setOpenDetails((prev) => ({ ...prev, ftc: !prev.ftc }))
                    }
                  >
                    <span className="flex items-center gap-2">
                      <span>공정위 (FTC)</span>
                    </span>
                    <span
                      className={`transition-transform ${
                        openDetails.ftc ? 'rotate-90' : ''
                      }`}
                    >
                      <svg
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                        className="w-3.5 h-3.5 text-slate-500"
                      >
                        <path
                          d="M7 5l6 5-6 5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>
                  {openDetails.ftc && (
                    <div className="mt-2 max-h-72 overflow-auto border-t border-slate-200 pt-2">
                      <pre className="whitespace-pre-wrap break-all">
                        {JSON.stringify(result.sources.ftc, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-2 text-left font-bold text-slate-800"
                    onClick={() =>
                      setOpenDetails((prev) => ({ ...prev, tm: !prev.tm }))
                    }
                  >
                    <span className="flex items-center gap-2">
                      <span>상표 검색 (KIPRIS)</span>
                    </span>
                    <span
                      className={`transition-transform ${
                        openDetails.tm ? 'rotate-90' : ''
                      }`}
                    >
                      <svg
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                        className="w-3.5 h-3.5 text-slate-500"
                      >
                        <path
                          d="M7 5l6 5-6 5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>
                  {openDetails.tm && (
                    <div className="mt-2 max-h-72 overflow-auto border-t border-slate-200 pt-2">
                      <pre className="whitespace-pre-wrap break-all">
                        {JSON.stringify(result.sources.kiprisTrademark, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-2 text-left font-bold text-slate-800"
                    onClick={() =>
                      setOpenDetails((prev) => ({
                        ...prev,
                        kiprisExtra: !prev.kiprisExtra,
                      }))
                    }
                  >
                    <span className="flex items-center gap-2">
                      <span>특허·실용 &amp; 상표 이력</span>
                    </span>
                    <span
                      className={`transition-transform ${
                        openDetails.kiprisExtra ? 'rotate-90' : ''
                      }`}
                    >
                      <svg
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                        className="w-3.5 h-3.5 text-slate-500"
                      >
                        <path
                          d="M7 5l6 5-6 5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>
                  {openDetails.kiprisExtra && (
                    <div className="mt-2 max-h-72 overflow-auto border-t border-slate-200 pt-2">
                      <pre className="whitespace-pre-wrap break-all">
                        {JSON.stringify(
                          {
                            patent: result.sources.kiprisPatent,
                            trademarkHistory: result.sources.kiprisTmHistory,
                          },
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 4. 하단 정보 */}
          <div className="text-center text-xs text-slate-400 mt-8">
            <p>최종 조회일시: {new Date().toLocaleString('ko-KR')}</p>
            {/* <p>CheckOn - 데이터로 증명하는 가장 확실한 신뢰</p> */}
          </div>
        </div>
      )}
    </main>
  );
}
