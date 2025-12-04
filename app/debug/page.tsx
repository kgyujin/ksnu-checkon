'use client';

import { useState, useEffect } from 'react';

/**
 * CheckOn API 상태 확인 페이지
 * 
 * 공정위, 국세청, 특허청 API의 연결 상태를 종합적으로 확인
 * 개발 및 운영 환경에서 시스템 상태를 모니터링하기 위한 디버그 페이지
 */
export default function APIStatusDebugPage() {
  const [apiStatusData, setApiStatusData] = useState<any>(null);
  const [isStatusLoading, setIsStatusLoading] = useState(true);

  useEffect(() => {
    fetchAndDisplayAPIStatus();
  }, []);

  async function fetchAndDisplayAPIStatus(): Promise<void> {
    try {
      const response = await fetch('/api/sample');
      const statusData = await response.json();
      setApiStatusData(statusData);
    } catch (error) {
      console.error('API 상태 조회 오류:', error);
    } finally {
      setIsStatusLoading(false);
    }
  }

  if (isStatusLoading) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-slate-600">API 상태 확인 중...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-slate-900 mb-8">CheckOn API 디버그</h1>

        <APIConnectionStatus apiStatusData={apiStatusData} />
        <StatusRecommendations recommendations={apiStatusData?.recommendations} />
        <TestBizNumbers suggestions={apiStatusData?.testSuggestions} />
        <RawResponseData data={apiStatusData} />
        <NavigationButtons />
      </div>
    </main>
  );
}

/**
 * API 연결 상태 카드
 */
function APIConnectionStatus({ apiStatusData }: { apiStatusData: any }) {
  const ntsStatus = apiStatusData?.apiStatus?.nts;
  const ftcStatus = apiStatusData?.apiStatus?.ftc;
  const kiprisStatus = apiStatusData?.apiStatus?.kipris;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-4">API 연결 상태</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <APIStatusCard title="국세청 (NTS)" status={ntsStatus} />
        <APIStatusCard title="공정위 (FTC)" status={ftcStatus} />
        <APIStatusCard title="특허청 (KIPRIS)" status={kiprisStatus} />
      </div>
    </div>
  );
}

/**
 * 개별 API 상태 카드
 */
interface APIStatusCardProps {
  title: string;
  status: any;
}

function APIStatusCard({ title, status }: APIStatusCardProps) {
  return (
    <div className="p-4 border rounded-lg bg-slate-50">
      <h3 className="font-bold text-lg mb-2">{title}</h3>
      <div className="text-sm text-slate-600 space-y-1">
        {status ? (
          <>
            <p><strong>상태:</strong> {status.status || 'N/A'}</p>
            <p><strong>설정됨:</strong> {status.isConfigured ? '✓ 설정됨' : '✗ 미설정'}</p>
            {status.hasData !== undefined && (
              <p><strong>데이터:</strong> {status.hasData ? '있음' : '없음'}</p>
            )}
          </>
        ) : (
          <p>상태 정보 없음</p>
        )}
      </div>
    </div>
  );
}

/**
 * 상태 권장사항
 */
function StatusRecommendations({ recommendations }: { recommendations: string[] }) {
  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
      <h2 className="text-2xl font-bold text-blue-900 mb-4">상태 확인</h2>
      <ul className="space-y-2">
        {recommendations.map((rec: string, idx: number) => (
          <li key={idx} className="text-blue-800">
            {rec}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 테스트 가능한 사업자번호
 */
interface TestSuggestionsProps {
  note?: string;
  examples?: Array<{ number?: string; description: string; source: string }>;
}

function TestBizNumbers({ suggestions }: { suggestions: TestSuggestionsProps }) {
  if (!suggestions) {
    return null;
  }

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 mb-6">
      <h2 className="text-2xl font-bold text-emerald-900 mb-4">테스트 가능한 사업자</h2>
      {suggestions.note && (
        <p className="text-emerald-800 mb-3">{suggestions.note}</p>
      )}
      <div className="space-y-2">
        {suggestions.examples?.map((ex: any, idx: number) => (
          <div key={idx} className="p-3 bg-white rounded border border-emerald-200">
            {ex.number && (
              <p className="font-mono font-bold text-emerald-700">{ex.number}</p>
            )}
            <p className="text-sm text-emerald-800">{ex.description}</p>
            <p className="text-xs text-emerald-600 mt-1">출처: {ex.source}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 원본 응답 데이터
 */
function RawResponseData({ data }: { data: any }) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-4">상세 데이터</h2>
      <pre className="bg-slate-100 p-4 rounded overflow-auto text-xs max-h-96">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

/**
 * 네비게이션 버튼
 */
function NavigationButtons() {
  return (
    <div className="mt-8 text-center">
      <a 
        href="/"
        className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
      >
        ← CheckOn 메인으로 돌아가기
      </a>
    </div>
  );
}
