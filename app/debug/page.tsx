'use client';

import { useState, useEffect } from 'react';

export default function DebugPage() {
  const [apiStatus, setApiStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/sample')
      .then(res => res.json())
      .then(data => {
        setApiStatus(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
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

        {/* API 상태 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-2xl font-bold text-slate-800 mb-4">API 연결 상태</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 국세청 */}
            <div className="p-4 border rounded-lg bg-slate-50">
              <h3 className="font-bold text-lg mb-2">국세청 (NTS)</h3>
              <div className="text-sm text-slate-600 space-y-1">
                <p><strong>상태:</strong> {apiStatus?.apiStatus?.nts?.status || 'N/A'}</p>
                <p><strong>설정됨:</strong> {apiStatus?.apiStatus?.nts?.isConfigured ? '설정됨' : '미설정'}</p>
                <p><strong>데이터:</strong> {apiStatus?.apiStatus?.nts?.hasData ? '있음' : '없음'}</p>
              </div>
            </div>

            {/* 공정위 */}
            <div className="p-4 border rounded-lg bg-slate-50">
              <h3 className="font-bold text-lg mb-2">공정위 (FTC)</h3>
              <div className="text-sm text-slate-600 space-y-1">
                <p><strong>상태:</strong> {apiStatus?.apiStatus?.ftc?.status || 'N/A'}</p>
                <p><strong>설정됨:</strong> {apiStatus?.apiStatus?.ftc?.isConfigured ? '설정됨' : '미설정'}</p>
              </div>
            </div>

            {/* 특허청 */}
            <div className="p-4 border rounded-lg bg-slate-50">
              <h3 className="font-bold text-lg mb-2">특허청 (KIPRIS)</h3>
              <div className="text-sm text-slate-600 space-y-1">
                <p><strong>상태:</strong> {apiStatus?.apiStatus?.kipris?.note}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 권장사항 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-bold text-blue-900 mb-4">상태 확인</h2>
          <ul className="space-y-2">
            {apiStatus?.recommendations?.map((rec: string, idx: number) => (
              <li key={idx} className="text-blue-800">{rec}</li>
            ))}
          </ul>
        </div>

        {/* 테스트 제안 */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-bold text-emerald-900 mb-4">테스트 가능한 사업자</h2>
          <p className="text-emerald-800 mb-3">{apiStatus?.testSuggestions?.note}</p>
          <div className="space-y-2">
            {apiStatus?.testSuggestions?.examples?.map((ex: any, idx: number) => (
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

        {/* 상세 응답 데이터 */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold text-slate-800 mb-4">상세 데이터</h2>
          <pre className="bg-slate-100 p-4 rounded overflow-auto text-xs">
            {JSON.stringify(apiStatus, null, 2)}
          </pre>
        </div>

        {/* 돌아가기 */}
        <div className="mt-8 text-center">
          <a 
            href="/"
            className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
          >
            ← CheckOn 메인으로 돌아가기
          </a>
        </div>
      </div>
    </main>
  );
}
