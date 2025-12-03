import { NextResponse } from 'next/server';

// API 연결 상태 테스트 엔드포인트
export async function GET() {
  const results: any = {
    timestamp: new Date().toISOString(),
    apis: {
      nts: {},
      ftc: {},
      kipris: {}
    }
  };

  // 1. 국세청 API 테스트
  try {
    const ntsApiKey = process.env.NTS_API_KEY;
    const ntsUrl = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${ntsApiKey}&returnType=JSON`;
    
    const ntsRes = await fetch(ntsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ "b_no": ["0000000000"] }) // 테스트용 더미
    });
    
    results.apis.nts = {
      status: ntsRes.status,
      statusText: ntsRes.statusText,
      isConfigured: !!ntsApiKey,
      apiKeyExists: ntsApiKey ? true : false
    };
  } catch (e: any) {
    results.apis.nts = {
      error: e.message
    };
  }

  // 2. 공정위 API 테스트
  try {
    const ftcApiKey = process.env.FTC_API_KEY;
    const ftcUrl = `https://apis.data.go.kr/1130000/MllBsDtl_3Service/getMllBsInfoDetail_3?serviceKey=${ftcApiKey}&pageNo=1&numOfRows=1&resultType=json&brno=0000000000`;
    
    const ftcRes = await fetch(ftcUrl);
    
    results.apis.ftc = {
      status: ftcRes.status,
      statusText: ftcRes.statusText,
      isConfigured: !!ftcApiKey,
      apiKeyExists: ftcApiKey ? true : false
    };
  } catch (e: any) {
    results.apis.ftc = {
      error: e.message
    };
  }

  // 3. 특허청 API 테스트
  try {
    const kiprisApiKey = process.env.KIPRIS_API_KEY;
    results.apis.kipris = {
      isConfigured: !!kiprisApiKey,
      apiKeyExists: kiprisApiKey ? true : false,
      note: 'KIPRIS는 추가 구현 필요'
    };
  } catch (e: any) {
    results.apis.kipris = {
      error: e.message
    };
  }

  return NextResponse.json(results);
}
