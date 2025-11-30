import { NextResponse } from 'next/server';

interface RequestBody {
  bizNumber: string;
  brandName?: string;
}

export async function POST(request: Request) {
  try {
    const body: RequestBody = await request.json();
    const { bizNumber, brandName } = body;
    const cleanBizNum = bizNumber.replace(/-/g, ''); // 하이픈 제거

    // 1. 국세청 (NTS) 처리
    const ntsResult = await handleNTS(cleanBizNum);

    // 2. 공정위 (FTC) 처리
    // 국세청 결과가 '정상(계속사업자)'이거나, Mock 모드일 때만 실행
    let ftcResult = { status: '정보 없음', message: '사업자 상태 확인 필요' };
    
    if (ntsResult.isValid) {
      ftcResult = await handleFTC(cleanBizNum);
    }

    // 3. 특허청 (KIPRIS) 처리
    let kiprisResult = { status: '정보 없음', message: '' };
    if (brandName) {
      kiprisResult = await handleKIPRIS(brandName);
    }

    // 4. 최종 결과 반환
    return NextResponse.json({
      success: true,
      data: {
        bizStatus: ntsResult.message,
        onlineLicense: ftcResult.message,
        brandRight: kiprisResult.message,
        summary: ntsResult.isValid
          ? '✅ 국세청 등록 정보가 확인되었습니다.'
          : '⚠️ 국세청에 등록되지 않았거나 휴/폐업된 사업자입니다.'
      }
    });

  } catch (error) {
    console.error('Server Error:', error);
    return NextResponse.json({ success: false, message: '서버 내부 오류' }, { status: 500 });
  }
}

// =================================================================
// 1. 국세청 (NTS) 핸들러
// =================================================================
async function handleNTS(cleanBizNum: string) {
  const isMock = process.env.USE_MOCK_NTS === 'true';

  if (isMock) {
    console.log('📢 [NTS] Mock 모드 실행');
    const isActive = parseInt(cleanBizNum) % 2 === 0; 
    return {
      isValid: isActive,
      message: isActive ? '[TEST] 계속사업자(01)' : '[TEST] 폐업자(03)'
    };
  } else {
    console.log('🚀 [NTS] 실제 API 호출');
    const apiKey = process.env.NTS_API_KEY;
    const url = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${apiKey}&returnType=JSON`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json' 
        },
        body: JSON.stringify({ "b_no": [cleanBizNum] })
      });

      if (res.ok) {
        const data = await res.json();
        const item = data.data?.[0]; 
        
        if (!item) return { isValid: false, message: '국세청 데이터 없음' };

        const isActive = item.b_stt_cd === '01';
        return {
          isValid: isActive,
          message: item.b_stt || '상태 알 수 없음'
        };
      } else {
        throw new Error(`API Error: ${res.status}`);
      }
    } catch (e) {
      console.error('NTS Fetch Error:', e);
      return { isValid: false, message: '조회 실패 (API 오류)' };
    }
  }
}

// =================================================================
// 2. 공정위 (FTC) 핸들러 (PDF 기반 URL 및 파라미터 적용)
// =================================================================
async function handleFTC(cleanBizNum: string) {
  const isMock = process.env.USE_MOCK_FTC === 'true';

  if (isMock) {
    console.log('📢 [FTC] Mock 모드 실행');
    return { status: 'OK', message: '[TEST] 통신판매업 신고 확인됨' };
  } else {
    console.log('🚀 [FTC] 실제 API 호출 시도');
    const apiKey = process.env.FTC_API_KEY;

    // [PDF 소스 377, 382] 기반의 정확한 URL
    const baseUrl = 'https://apis.data.go.kr/1130000/MllBsDtl_3Service/getMllBsInfoDetail_3';
    
    const params = new URLSearchParams({
        serviceKey: apiKey || '', 
        pageNo: '1',            // [PDF 소스 393] 필수
        numOfRows: '1',         // [PDF 소스 398] 필수
        resultType: 'json',     // [PDF 소스 404] JSON 요청
        brno: cleanBizNum       // [PDF 소스 421] 사업자등록번호 파라미터
    });

    try {
        // 타임아웃 15초 설정 (서버 지연 대응)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(`${baseUrl}?${params.toString()}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (res.ok) {
            const data = await res.json();
            
            // 응답 구조 유연하게 처리 (JSON 구조가 다를 수 있음)
            const items = data.items || data.response?.body?.items || data.getMllBsInfoDetail_3?.items;
            
            // 데이터가 배열이든 객체든 존재하면 '신고됨'으로 간주
            if (items && (Array.isArray(items) ? items.length > 0 : items)) {
                 return { status: 'OK', message: '통신판매업 신고 확인됨' };
            } else {
                 return { status: 'NONE', message: '통신판매업 내역 없음 (주의)' };
            }
        } else {
            console.error(`FTC API Error: ${res.status}`);
            return { status: 'ERROR', message: '공정위 서버 응답 없음' };
        }
    } catch (e: any) {
        if (e.name === 'AbortError') {
            console.error('FTC Timeout: 15초 초과');
            return { status: 'TIMEOUT', message: '공정위 조회 시간 초과 (서버 지연)' };
        }
        console.error('FTC Fetch Error:', e);
        return { status: 'ERROR', message: 'API 연결 오류' };
    }
  }
}

// =================================================================
// 3. 특허청 (KIPRIS) 핸들러
// =================================================================
async function handleKIPRIS(brandName: string) {
  const isMock = process.env.USE_MOCK_KIPRIS === 'true';

  if (isMock) {
    return { 
      status: 'Test', 
      message: brandName.includes('체크온') ? '[TEST] 상표권 등록됨' : '[TEST] 등록 정보 없음' 
    };
  } else {
    return { status: 'Unknown', message: 'API 키 미발급 상태' };
  }
}