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

  const handleToggleDetailSection = (section: keyof typeof expandedDetailSection) => {
    setExpandedDetailSection((prev) => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

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
          onToggleSection={handleToggleDetailSection}
        />
      )}
    </main>
  );
}

/**
 * 헤더 영역: 애플리케이션 소개
 */
function HeaderSection() {
  return (
    <div className="max-w-3xl mx-auto text-center mb-8">
      <h1 className="text-4xl font-black text-slate-900 mb-2 flex items-center justify-center gap-3">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="w-6 h-6">
            <rect x="3" y="4" width="18" height="16" rx="4" ry="4" fill="currentColor" opacity="0.12" />
            <path d="M8.5 12.5L11 15l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
        <span>CheckOn</span>
      </h1>
      <p className="text-base md:text-lg text-slate-500">
        여러 공공 데이터를 한 번에 조회해 사업자 정보를 종합적으로 확인할 수 있는 도구입니다.
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

/**
 * 검색 폼: 사업자등록번호 입력 및 조회
 */
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
  onToggleSection: (section: "nts" | "ftc" | "tm" | "kiprisExtra") => void;
}

/**
 * 결과 영역: 조회 결과 전체 표시
 */
function ResultSection({ data, expandedSections, onToggleSection }: ResultSectionProps) {
  return (
    <div className="max-w-3xl mx-auto animate-fade-in-up space-y-6">
      <CompanyProfileCard data={data} />
      <CompanyDetailsGrid data={data} />
      {shouldDisplayIPAssetsSummary(data) && (
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

/**
 * 기업 프로필 카드: 회사 기본 정보
 */
function CompanyProfileCard({ data }: { data: any }) {
  const businessInfo = data.businessInfo || {};

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
      <div className="p-8">
        <div className="flex flex-col gap-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <CompanyBasicInfo businessInfo={businessInfo} />
          </div>

          {businessInfo.address && (
            <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm h-56">
              <iframe
                title="사업자 위치 지도"
                src={`https://www.google.com/maps?q=${encodeURIComponent(businessInfo.address)}&output=embed`}
                className="w-full h-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          )}
        </div>

        <CompanySummaryBox summary={data.summary} />
      </div>
    </div>
  );
}

/**
 * 기업 기본 정보 표시
 */
function CompanyBasicInfo({ businessInfo }: { businessInfo: any }) {
  return (
    <div className="flex-1">
      <div className="flex flex-wrap gap-2 mb-4">
        {businessInfo.ntsStatus && (
          <StatusBadge
            label={businessInfo.ntsStatus}
            isActive={businessInfo.ntsStatus.includes('계속')}
          />
        )}
        {businessInfo.taxType && (
          <StatusBadge label={businessInfo.taxType} isActive={true} variant="info" />
        )}
      </div>

      <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-2">
        {businessInfo.corpName || '회사명 정보 없음'}
      </h2>

      <AddressDisplay address={businessInfo.address} />
      {businessInfo.address && (
        <AddressDisplay address={businessInfo.address} />
      )}

      {/* 대표자 및 기본 정보 */}
      <div className="flex flex-wrap gap-6 text-sm md:text-base mt-4">
        {businessInfo.representative && (
          <InfoItem label="대표자" value={businessInfo.representative} />
        )}
        {businessInfo.bizNumber && (
          <InfoItem label="사업자등록번호" value={businessInfo.bizNumber} isMonospace={true} />
        )}
      </div>
    </div>
  );
}

/**
 * 상태 배지 컴포넌트
 */
interface StatusBadgeProps {
  label: string;
  isActive: boolean;
  variant?: 'default' | 'info';
}

function StatusBadge({ label, isActive, variant = 'default' }: StatusBadgeProps) {
  const badgeClassName = variant === 'info' 
    ? 'bg-blue-100 text-blue-700'
    : isActive 
      ? 'bg-green-100 text-green-700'
      : 'bg-red-100 text-red-700';

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold ${badgeClassName}`}>
      {label}
    </span>
  );
}

/**
 * 주소 표시 컴포넌트
 */
function AddressDisplay({ address }: { address: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-start gap-2">
        <span className="mt-1 inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 text-blue-600">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4">
            <path d="M12 3.5C9.24 3.5 7 5.74 7 8.5c0 3.77 4.12 7.85 4.86 8.54.07.07.17.11.27.11s.2-.04.27-.11C12.88 16.35 17 12.27 17 8.5 17 5.74 14.76 3.5 12 3.5z" fill="currentColor" opacity="0.15" />
            <path d="M12 3.5C9.24 3.5 7 5.74 7 8.5c0 3.77 4.12 7.85 4.86 8.54.07.07.17.11.27.11s.2-.04.27-.11C12.88 16.35 17 12.27 17 8.5 17 5.74 14.76 3.5 12 3.5z" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="12" cy="8.5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </span>
        <p className="text-slate-600 text-base md:text-lg">
          {address}
        </p>
      </div>
    </div>
  );
}

/**
 * 정보 항목 컴포넌트
 */
interface InfoItemProps {
  label: string;
  value: string;
  isMonospace?: boolean;
}

function InfoItem({ label, value, isMonospace = false }: InfoItemProps) {
  return (
    <div>
      <span className="text-slate-500">{label}</span>
      <p className={`font-bold text-slate-900 ${isMonospace ? 'font-mono' : ''}`}>
        {value}
      </p>
    </div>
  );
}

/**
 * 신뢰도 점수 카드 (비활성화됨)
 */
// function TrustScoreCard({ score, businessInfo }: { score: any; businessInfo: any }) {
//   return (
//     <div className="md:w-64 flex-shrink-0 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 md:p-8 border border-blue-200 flex flex-col justify-between self-start">
//       <div className="text-center">
//         <div className="text-xs md:text-sm text-slate-600 font-bold mb-1 md:mb-2">
//           신뢰도 점수
//         </div>
//         <div className="text-4xl md:text-5xl font-black text-blue-600">
//           {score.score || 0}
//         </div>
//         <div className="text-[11px] md:text-xs text-slate-500 mt-1 md:mt-2">
//           / 100점
//         </div>
//       </div>
//
//       <div className="mt-4 md:mt-6 space-y-1.5 text-[11px] md:text-xs">
//         <ScoreBreakdownItem label="국세청" value={score.breakdown?.nts || 0} />
//         <ScoreBreakdownItem label="공정위" value={score.breakdown?.ftc || 0} />
//         <ScoreBreakdownItem label="특허청" value={score.breakdown?.kipris || 0} />
//       </div>
//
//       <ReferenceLinksBox businessInfo={businessInfo} />
//     </div>
//   );
// }

/**
 * 신뢰도 점수 구성 항목 (비활성화됨)
 */
// function ScoreBreakdownItem({ label, value }: { label: string; value: number }) {
//   return (
//     <div className="flex justify-between text-slate-600">
//       <span>{label}</span>
//       <span className="font-bold">{value}점</span>
//     </div>
//   );
// }

/**
 * 참고 링크 박스
 */
function ReferenceLinksBox({ businessInfo }: { businessInfo: any }) {
  const domains = businessInfo.domain || [];

  return (
    <div className="mt-3 md:mt-4 text-[10px] md:text-[11px] text-slate-500 text-left space-y-0.5">
      <p className="font-semibold text-slate-600">참고 링크</p>
      {domains.length > 0 ? (
        domains.slice(0, 2).map((url: string, idx: number) => (
          <p key={idx}>
            •{' '}
            <a
              href={url.startsWith('http') ? url : `https://${url}`}
              target="_blank"
              rel="noreferrer"
              className="underline break-all text-blue-600"
            >
              {url}
            </a>
          </p>
        ))
      ) : (
        <p>• 참고할 수 있는 공식 웹사이트 정보가 없습니다.</p>
      )}
    </div>
  );
}

/**
 * 기업 정보 요약 박스
 */
function CompanySummaryBox({ summary }: { summary: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 text-slate-50">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4">
            <rect x="6.5" y="4.5" width="11" height="15" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M9 8.5h6M9 11h6M9 13.5h4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </span>
        <span className="font-bold text-slate-900">기업 정보 요약</span>
      </div>
      <p className="text-slate-700 leading-relaxed whitespace-pre-line text-sm md:text-base">
        {summary}
      </p>
    </div>
  );
}

/**
 * 기업 상세 정보 그리드
 */
function CompanyDetailsGrid({ data }: { data: any }) {
  const businessInfo = data.businessInfo || {};

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <ECommerceInfoCard businessInfo={businessInfo} onlineLicense={data.onlineLicense} />
      <TaxInfoCard businessInfo={businessInfo} />
      {shouldDisplayBusinessTypeInfo(businessInfo) && (
        <BusinessTypeInfoCard businessInfo={businessInfo} />
      )}
      <TrademarkInfoCard brandRight={data.brandRight} />
    </div>
  );
}

/**
 * 전자상거래 정보 카드
 */
function ECommerceInfoCard({ businessInfo, onlineLicense }: { businessInfo: any; onlineLicense: string }) {
  const isRegistered = onlineLicense?.includes('확인');

  return (
    <DetailCard title="전자상거래 자격" icon="shopping">
      <DetailItem
        label="통신판매업 신고"
        value={isRegistered ? '신고 완료' : '미신고 또는 확인 불가'}
        isHighlight={isRegistered}
      />
      {businessInfo.ftcNumber && (
        <DetailItem label="신고번호" value={businessInfo.ftcNumber} isMonospace={true} />
      )}
      {businessInfo.domain && businessInfo.domain.length > 0 && (
        <div className="flex justify-between items-start">
          <span className="text-slate-600">공식 웹사이트</span>
          <div className="text-right">
            {businessInfo.domain.map((url: string, idx: number) => (
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
          </div>
        </div>
      )}
    </DetailCard>
  );
}

/**
 * 세무 정보 카드
 */
function TaxInfoCard({ businessInfo }: { businessInfo: any }) {
  const canIssueInvoice = businessInfo.utccYn === '가능';

  return (
    <DetailCard title="세무 정보" icon="currency">
      <DetailItem label="개업일자" value={businessInfo.startDt || '정보 없음'} />
      <DetailItem label="과세 유형" value={businessInfo.taxType || '정보 없음'} />
      <DetailItem
        label="세금계산서"
        value={canIssueInvoice ? '발행 가능 (국세청 정보 기준)' : '발행 불가 또는 확인 불가'}
        isHighlight={canIssueInvoice}
      />
    </DetailCard>
  );
}

/**
 * 업종 정보 카드
 */
function BusinessTypeInfoCard({ businessInfo }: { businessInfo: any }) {
  return (
    <DetailCard title="업종 정보" icon="chart">
      {businessInfo.bizType && (
        <DetailItem label="업태" value={businessInfo.bizType} />
      )}
      {businessInfo.bizItem && (
        <DetailItem label="주요 품목" value={businessInfo.bizItem} />
      )}
    </DetailCard>
  );
}

/**
 * 상표권 정보 카드
 */
function TrademarkInfoCard({ brandRight }: { brandRight: string }) {
  const message = brandRight || '자동 상표권 조회 기능은 현재 준비 중입니다. 특허청 KIPRIS에서 직접 상표권 등록 여부를 확인해 주세요.';

  return (
    <DetailCard title="상표권 정보" icon="trademark">
      <p className="text-slate-700 text-sm md:text-base leading-relaxed whitespace-pre-line">
        {message}
      </p>
    </DetailCard>
  );
}

/**
 * 일반 상세 카드
 */
interface DetailCardProps {
  title: string;
  icon?: string;
  children: React.ReactNode;
}

function DetailCard({ title, children }: DetailCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-100 p-6 text-sm md:text-base">
      <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2 text-lg">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-50 text-emerald-600">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4">
            <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </span>
        <span>{title}</span>
      </h3>
      <dl className="space-y-4">
        {children}
      </dl>
    </div>
  );
}

/**
 * 상세 정보 항목
 */
interface DetailItemProps {
  label: string;
  value: string;
  isHighlight?: boolean;
  isMonospace?: boolean;
}

function DetailItem({ label, value, isHighlight = false, isMonospace = false }: DetailItemProps) {
  return (
    <div className="flex justify-between items-center">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`font-bold ${isMonospace ? 'font-mono text-sm' : ''} ${isHighlight ? 'text-green-600' : 'text-slate-900'}`}>
        {value}
      </dd>
    </div>
  );
}

/**
 * IP 자산 요약 그리드
 */
function IPAssetsSummaryGrid({ data }: { data: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {data.sources?.kiprisPatent && (
        <IPAssetSummaryCard
          title="특허·실용 공보 요약"
          message={data.sources.kiprisPatent.message}
        />
      )}
      {data.sources?.kiprisTmHistory && (
        <IPAssetSummaryCard
          title="상표 행정처리 이력 요약"
          message={data.sources.kiprisTmHistory.message}
        />
      )}
    </div>
  );
}

/**
 * IP 자산 요약 카드
 */
function IPAssetSummaryCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-100 p-6">
      <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2 text-lg">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-sky-50 text-sky-600">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4">
            <rect x="6.5" y="5.5" width="11" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M9 9.5h6M9 12h4.5M9 14.5h3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </span>
        <span>{title}</span>
      </h3>
      <p className="text-sm md:text-base text-slate-700 leading-relaxed whitespace-pre-line">
        {message}
      </p>
    </div>
  );
}

/**
 * 공공 데이터 상세 정보 섹션
 */
interface RawDataSectionProps {
  data: any;
  expandedSections: Record<string, boolean>;
  onToggleSection: (section: "nts" | "ftc" | "tm" | "kiprisExtra") => void;
}

function RawDataSection({ data, expandedSections, onToggleSection }: RawDataSectionProps) {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6">
      <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2 text-lg">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 text-slate-50">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4">
            <rect x="4.2" y="6.5" width="15.6" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5.5 9.5h5.2l1-1.8h6.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span>공공데이터 상세 정보</span>
      </h3>
      <p className="text-sm text-slate-600 mb-4">
        공공 데이터 포털(Open API)에서 조회한 원본 응답을 한눈에 확인할 수 있습니다.
      </p>
      <div className="space-y-3 text-xs font-mono">
        <ExpandableDetailSection
          title="국세청 (NTS)"
          content={data.nts}
          isExpanded={expandedSections.nts}
          onToggle={() => onToggleSection('nts')}
        />
        <ExpandableDetailSection
          title="공정위 (FTC)"
          content={data.ftc}
          isExpanded={expandedSections.ftc}
          onToggle={() => onToggleSection('ftc')}
        />
        <ExpandableDetailSection
          title="상표 검색 (KIPRIS)"
          content={data.kiprisTrademark}
          isExpanded={expandedSections.tm}
          onToggle={() => onToggleSection('tm')}
        />
        <ExpandableDetailSection
          title="특허·실용 & 상표 이력"
          content={{
            patent: data.kiprisPatent,
            trademarkHistory: data.kiprisTmHistory,
          }}
          isExpanded={expandedSections.kiprisExtra}
          onToggle={() => onToggleSection('kiprisExtra')}
        />
      </div>
    </div>
  );
}

/**
 * 펼칠 수 있는 상세 섹션
 */
interface ExpandableDetailSectionProps {
  title: string;
  content: any;
  isExpanded: boolean;
  onToggle: () => void;
}

function ExpandableDetailSection({ title, content, isExpanded, onToggle }: ExpandableDetailSectionProps) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 text-left font-bold text-slate-800"
        onClick={onToggle}
      >
        <span>{title}</span>
        <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
          <svg viewBox="0 0 20 20" aria-hidden="true" className="w-3.5 h-3.5 text-slate-500">
            <path d="M7 5l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {isExpanded && (
        <div className="mt-2 max-h-72 overflow-auto border-t border-slate-200 pt-2">
          <pre className="whitespace-pre-wrap break-all">
            {JSON.stringify(content, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * 푸터
 */
function Footer() {
  return (
    <div className="text-center text-xs text-slate-400 mt-8">
      <p>최종 조회일시: {new Date().toLocaleString('ko-KR')}</p>
    </div>
  );
}

/**
 * IP 자산 요약 표시 여부 판단
 */
function shouldDisplayIPAssetsSummary(data: any): boolean {
  return !!(data.sources?.kiprisPatent || data.sources?.kiprisTmHistory);
}

/**
 * 업종 정보 표시 여부 판단
 */
function shouldDisplayBusinessTypeInfo(businessInfo: any): boolean {
  return !!(businessInfo.bizType || businessInfo.bizItem);
}
