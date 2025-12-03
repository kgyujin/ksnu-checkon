import { NextResponse } from 'next/server';

/**
 * 실제 공공 API를 테스트할 수 있는 엔드포인트
 * /api/sample으로 접근하여 샘플 데이터 확인 가능
 */
export async function GET() {
  const results: any = {
    timestamp: new Date().toISOString(),
    guide: {
      title: 'CheckOn API 테스트 가이드',
      description: '실제 API 연결 상태 및 데이터 샘플 확인',
    },
    apiStatus: {},
    recommendations: []
  };

  // 1. 국세청 API 상태 테스트
  try {
    console.log('🏢 국세청 API 테스트 중...');
    const ntsApiKey = process.env.NTS_API_KEY;
    const ntsUrl = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${ntsApiKey}&returnType=JSON`;
    
    // 유효한 사업자등록번호로 테스트
    const ntsRes = await fetch(ntsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ "b_no": ["1234567890"] })
    });
    
    const ntsData = await ntsRes.json();
    results.apiStatus.nts = {
      status: ntsRes.status,
      statusText: ntsRes.statusText,
      isConfigured: !!ntsApiKey,
      hasData: ntsData?.data?.length > 0,
      sampleResponse: ntsData?.data?.[0] || 'No data'
    };

    if (ntsRes.ok && ntsData?.data?.length > 0) {
      results.recommendations.push('✅ 국세청 API 정상 작동');
    } else {
      results.recommendations.push('⚠️ 국세청 API: 사업자등록번호 미등록 또는 비활성');
    }
  } catch (e: any) {
    results.apiStatus.nts = {
      error: e.message,
      note: '국세청 API 연결 실패'
    };
    results.recommendations.push(`❌ 국세청 API 오류: ${e.message}`);
  }

  // 2. 공정위 API 상태 테스트
  try {
    console.log('⚖️ 공정위 API 테스트 중...');
    const ftcApiKey = process.env.FTC_API_KEY;
    const ftcUrl = `https://apis.data.go.kr/1130000/MllBsDtl_3Service/getMllBsInfoDetail_3`;
    
    const params = new URLSearchParams({
      serviceKey: ftcApiKey || '',
      pageNo: '1',
      numOfRows: '10',
      resultType: 'json',
      brno: '1234567890'
    });
    
    const ftcRes = await fetch(`${ftcUrl}?${params.toString()}`);
    const ftcData = await ftcRes.json();
    
    results.apiStatus.ftc = {
      status: ftcRes.status,
      statusText: ftcRes.statusText,
      isConfigured: !!ftcApiKey,
      sampleResponse: ftcData || 'No response'
    };

    if (ftcRes.ok) {
      results.recommendations.push('✅ 공정위 API 정상 작동');
    } else {
      results.recommendations.push('⚠️ 공정위 API: 응답 대기 중 또는 데이터 없음');
    }
  } catch (e: any) {
    results.apiStatus.ftc = {
      error: e.message,
      note: '공정위 API 연결 실패'
    };
    results.recommendations.push(`❌ 공정위 API 오류: ${e.message}`);
  }

  // 3. 특허청 상태
  results.apiStatus.kipris = {
    note: '특허청 API는 별도 구현 필요',
    status: 'Pending'
  };
  results.recommendations.push('⏳ 특허청: API 연동 준비 중');

  // 테스트 가능한 사업자등록번호
  results.testSuggestions = {
    note: '다음 사업자등록번호들로 테스트해보세요:',
    examples: [
      {
        number: '1234567890',
        description: '샘플 사업자',
        source: 'API 테스트용'
      },
      {
        description: '실제 사업자를 위해서는 한국 기업의 공식 사업자등록번호 사용',
        source: '기업 공식 웹사이트 또는 신용조회 서비스'
      }
    ]
  };

  return NextResponse.json(results);
}
