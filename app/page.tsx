'use client';

import { useState } from 'react';

export default function Home() {
  const [bizNum, setBizNum] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);

  const loadingSteps = [
    '🏢 공정위 기업 정보 조회 중...',
    '⚖️ 국세청 상태 검증 중...',
    '®️ 특허청 상표권 분석 중...',
    '📊 신뢰도 점수 최종 계산 중...'
  ];

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!bizNum.trim()) {
      alert('사업자등록번호를 입력해주세요.');
      return;
    }

    setLoading(true);
    setResult(null);
    setLoadingStep(0);

    const stepInterval = setInterval(() => {
      setLoadingStep((prev) => {
        const next = prev + 1;
        if (next >= loadingSteps.length) {
          return prev;
        }
        return next;
      });
    }, 1500);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bizNumber: bizNum }),
      });

      const data = await res.json();
      setResult(data.data);
    } catch (error) {
      alert('조회 중 오류가 발생했습니다.');
      console.error(error);
    } finally {
      clearInterval(stepInterval);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 pt-12 pb-20 px-4">
      {/* 헤더 */}
      <div className="max-w-3xl mx-auto text-center mb-8">
        <h1 className="text-4xl font-black text-slate-900 mb-2">CheckOn</h1>
        <p className="text-lg text-slate-500">사업자번호만 입력하면 AI가 신뢰도를 분석해드립니다</p>
      </div>

      {/* 검색 박스 */}
      <div className="max-w-xl mx-auto mb-12">
        <form onSubmit={handleCheck} className="relative">
          <input
            type="text"
            value={bizNum}
            onChange={(e) => setBizNum(e.target.value)}
            placeholder="사업자등록번호 (예: 1248100998)"
            className="w-full px-6 py-4 text-lg bg-white border-2 border-slate-200 rounded-full shadow-md focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
          />
          <button
            type="submit"
            disabled={loading}
            className="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-8 rounded-full font-bold transition-all"
          >
            {loading ? `${loadingSteps[loadingStep]}` : '조회'}
          </button>
        </form>
        {loading && (
          <div className="mt-3 text-center text-sm text-slate-500">
            {loadingSteps[loadingStep]}
          </div>
        )}
      </div>

      {/* 결과 */}
      {result && !loading && (
        <div className="max-w-3xl mx-auto animate-fade-in-up space-y-6">
          
          {/* 1. 메인 카드 - 회사 정보 + 신뢰도 */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
            <div className="p-8">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
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
                    <p className="text-slate-600 text-lg mb-4">
                      📍 {result.businessInfo.address}
                    </p>
                  )}

                  {/* 대표자 및 기본 정보 */}
                  <div className="flex flex-wrap gap-6 text-sm">
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
                <div className="flex-shrink-0 text-center bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-200">
                  <div className="text-sm text-slate-600 font-bold mb-2">신뢰도 점수</div>
                  <div className="text-5xl font-black text-blue-600">{result.safetyScore?.score || 0}</div>
                  <div className="text-xs text-slate-500 mt-2">/ 100점</div>
                  
                  {/* 점수 구성 */}
                  <div className="mt-4 space-y-1 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>국세청:</span>
                      <span className="font-bold">{result.safetyScore?.breakdown?.nts || 0}점</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>공정위:</span>
                      <span className="font-bold">{result.safetyScore?.breakdown?.ftc || 0}점</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>특허청:</span>
                      <span className="font-bold">{result.safetyScore?.breakdown?.kipris || 0}점</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI 브리핑 */}
              <div className="mt-8 bg-slate-50 rounded-xl p-6 border border-slate-200">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">🤖</span>
                  <span className="font-bold text-slate-900">AI 분석 요약</span>
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
            <div className="bg-white rounded-xl shadow-md border border-slate-100 p-6">
              <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2 text-lg">
                <span>🛒</span> 전자상거래 자격
              </h3>
              <dl className="space-y-4">
                <div className="flex justify-between items-center">
                  <dt className="text-slate-600">통신판매업 신고</dt>
                  <dd className={`font-bold ${
                    result.onlineLicense?.includes('확인')
                      ? 'text-green-600'
                      : 'text-slate-400'
                  }`}>
                    {result.onlineLicense?.includes('확인') ? '✅ 완료' : '❌ 미신고'}
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
            <div className="bg-white rounded-xl shadow-md border border-slate-100 p-6">
              <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2 text-lg">
                <span>💰</span> 세무 정보
              </h3>
              <dl className="space-y-4">
                {result.businessInfo?.startDt && (
                  <div className="flex justify-between items-center">
                    <dt className="text-slate-600">개업일자</dt>
                    <dd className="font-medium text-slate-900">{result.businessInfo.startDt}</dd>
                  </div>
                )}
                {result.businessInfo?.taxType && (
                  <div className="flex justify-between items-center">
                    <dt className="text-slate-600">과세 유형</dt>
                    <dd className="font-medium text-slate-900">{result.businessInfo.taxType}</dd>
                  </div>
                )}
                {result.businessInfo?.utccYn && (
                  <div className="flex justify-between items-center">
                    <dt className="text-slate-600">세금계산서</dt>
                    <dd className={`font-bold ${
                      result.businessInfo.utccYn === '가능'
                        ? 'text-green-600'
                        : 'text-slate-400'
                    }`}>
                      {result.businessInfo.utccYn === '가능' ? '✅ 발행 가능' : '❌ 불가'}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* 업종 정보 */}
            {(result.businessInfo?.bizType || result.businessInfo?.bizItem) && (
              <div className="bg-white rounded-xl shadow-md border border-slate-100 p-6">
                <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2 text-lg">
                  <span>📊</span> 업종 정보
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
            <div className="bg-white rounded-xl shadow-md border border-slate-100 p-6">
              <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2 text-lg">
                <span>®️</span> 상표권 정보
              </h3>
              <p className="text-slate-700">
                {result.brandRight || '상표권 정보 조회 중...'}
              </p>
            </div>
          </div>

          {/* 3. 하단 정보 */}
          <div className="text-center text-xs text-slate-400 mt-8">
            <p>최종 조회일시: {new Date().toLocaleString('ko-KR')}</p>
            <p>CheckOn - 데이터로 증명하는 가장 확실한 신뢰</p>
          </div>
        </div>
      )}
    </main>
  );
}
