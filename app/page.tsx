'use client';

import { useState } from 'react';

export default function Home() {
  const [bizNum, setBizNum] = useState('');
  const [brand, setBrand] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bizNumber: bizNum, brandName: brand }),
      });
      const data = await res.json();
      setResult(data.data);
    } catch (error) {
      alert('검색 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-center mb-2 text-blue-600">CheckOn</h1>
        <p className="text-center text-gray-500 mb-8">사업자 신뢰도 원스톱 조회</p>

        <form onSubmit={handleCheck} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">사업자등록번호 (필수)</label>
            <input 
              type="text" 
              value={bizNum}
              onChange={(e) => setBizNum(e.target.value)}
              // [수정됨] text-[#121212] 적용 (진한 검정색)
              className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-[#121212] placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="000-00-00000"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">상호명 (선택 - 브랜드 검증)</label>
            <input 
              type="text" 
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              // [수정됨] text-[#121212] 적용 (진한 검정색)
              className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-[#121212] placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="예: 체크온"
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 transition disabled:bg-gray-400"
          >
            {loading ? '데이터 분석 중...' : '신뢰도 진단하기'}
          </button>
        </form>

        {result && (
          <div className="mt-8 border-t pt-6">
            <h3 className="font-bold text-lg mb-4 text-[#121212]">진단 리포트</h3>
            <div className="space-y-3">
              <ResultItem label="국세청 (사업 상태)" value={result.bizStatus} isGood={result.bizStatus.includes('계속') || result.bizStatus.includes('정상')} />
              <ResultItem label="공정위 (판매 자격)" value={result.onlineLicense} isGood={result.onlineLicense.includes('확인됨')} />
              <ResultItem label="특허청 (상표권)" value={result.brandRight} isGood={result.brandRight.includes('있음') || result.brandRight.includes('등록')} />
            </div>
            <div className={`mt-6 p-4 rounded-lg text-center font-medium ${result.summary.includes('국세청 등록 정보가 확인') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {result.summary}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function ResultItem({ label, value, isGood }: { label: string, value: string, isGood: boolean }) {
  return (
    <div className="flex justify-between items-center p-3 bg-white border rounded-md">
      <span className="text-gray-600">{label}</span>
      <span className={`font-bold ${isGood ? 'text-green-600' : 'text-gray-500'}`}>{value}</span>
    </div>
  );
}