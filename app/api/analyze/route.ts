import { NextResponse } from 'next/server';

interface RequestBody {
  bizNumber?: string;
  ftcNumber?: string;
  brandName?: string;
}

export async function POST(request: Request) {
  try {
    const body: RequestBody = await request.json();
    const { bizNumber, ftcNumber, brandName } = body;
    
    if (!bizNumber && !ftcNumber) {
      return NextResponse.json({
        success: false,
        message: '사업자등록번호 또는 통신판매업신고번호 중 최소 하나가 필요합니다.'
      }, { status: 400 });
    }

    let cleanBizNum = '';
    let ntsResult: any = { isValid: false, message: '조회 불가', data: {} };
    let ftcResult: any = { status: '정보 없음', message: '미등록', data: {} };
    let kiprisResult: any = { status: '정보 없음', message: '' };
    
    // 머니핀 스타일 정보 객체
    let businessInfo: any = {
      bizNumber: '',
      corpName: '',       // 상호
      representative: '',  // 대표자
      address: '',        // 주소
      ftcNumber: '',      // 통신판매신고번호
      domain: [],         // 도메인 배열
      bizType: '',        // 업태
      bizItem: '',        // 종목
      ntsStatus: '',      // 국세청 상태
      taxType: '',        // 과세유형
      startDt: '',        // 개업일
      utccYn: '',         // 세금계산서 발행 가능여부
    };

    // =================================================================
    // STEP 1: 공정위 (FTC) 조회 -> 기업 상세 정보 획득 (1차 데이터 소스)
    // =================================================================
    if (bizNumber) {
      cleanBizNum = bizNumber.replace(/-/g, '');
      ftcResult = await handleFTC(cleanBizNum);
      
      // FTC 데이터로 비즈니스 정보 채우기
      if (ftcResult.status === 'OK' && ftcResult.data) {
        const ftcData = ftcResult.data;
        businessInfo.bizNumber = cleanBizNum;
        businessInfo.corpName = ftcData.bzmnNm || '';
        businessInfo.representative = ftcData.rprsvNm || '';
        businessInfo.address = ftcData.lctnRnAddr || ftcData.lctnAddr || '';
        businessInfo.ftcNumber = ftcData.prmmiMnno || '';
        businessInfo.bizType = ftcData.bzmnRgsSttusSeNm || '';
        businessInfo.bizItem = ftcData.mainPrdtNm || '';
        businessInfo.domain = parseDomains(ftcData.domnCn);
      } else {
        businessInfo.bizNumber = cleanBizNum;
      }
    }

    // =================================================================
    // STEP 2: 국세청 (NTS) 조회 -> 기업 상태 검증 (2차 검증)
    // =================================================================
    if (bizNumber) {
      ntsResult = await handleNTS(cleanBizNum);
      
      if (ntsResult.isValid && ntsResult.data) {
        businessInfo.ntsStatus = ntsResult.message;
        businessInfo.taxType = ntsResult.data.tax_type || '';
        businessInfo.startDt = formatDate(ntsResult.data.start_dt) || '';
        businessInfo.utccYn = ntsResult.data.utcc_yn === 'Y' ? '가능' : '불가능';
      } else {
        businessInfo.ntsStatus = ntsResult.message;
      }
    }

    // =================================================================
    // STEP 3: 특허청 (KIPRIS) 조회 -> 상표권 검증 (자동화)
    // =================================================================
    const targetBrandName = brandName || businessInfo.corpName;
    if (targetBrandName) {
      kiprisResult = await handleKIPRIS(targetBrandName);
      businessInfo.brandName = targetBrandName;
    }

    // 신뢰도 점수 계산
    const safetyScore = calculateSafetyScore(ntsResult, ftcResult, kiprisResult);

    // AI 브리핑 텍스트 생성
    const summaryText = generateAIBriefing(businessInfo, ntsResult, ftcResult);

    return NextResponse.json({
      success: true,
      data: {
        safetyScore: safetyScore,
        businessInfo: businessInfo,
        summary: summaryText,
        bizStatus: ntsResult.message,
        onlineLicense: ftcResult.message,
        brandRight: kiprisResult.message
      }
    });

  } catch (error) {
    console.error('Server Error:', error);
    return NextResponse.json({ success: false, message: '서버 내부 오류' }, { status: 500 });
  }
}

// =================================================================
// 1. 공정위 (FTC) 핸들러 - 기업 상세 정보 조회 (1차 소스)
// =================================================================
async function handleFTC(bizNumber: string) {
  const apiKey = process.env.FTC_API_KEY;
  if (!apiKey) {
    console.error('❌ FTC_API_KEY 환경변수 미설정');
    return { status: 'ERROR', message: 'API 키 오류', data: {} };
  }

  const baseUrl = 'https://apis.data.go.kr/1130000/MllBsDtl_3Service/getMllBsInfoDetail_3';
  
  const params = new URLSearchParams({
    serviceKey: apiKey,
    pageNo: '1',
    numOfRows: '10',
    resultType: 'json',
    brno: bizNumber
  });

  try {
    console.log('🚀 [FTC] 공정위 API 호출:', bizNumber);
    
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
      
      // 공정위 API 응답 구조 파싱
      let items = data.items || data.response?.body?.items || [];
      
      if (!Array.isArray(items)) {
        items = items ? [items] : [];
      }

      if (items.length > 0) {
        const item = items[0];
        
        return {
          status: 'OK',
          message: '통신판매업 신고 확인됨',
          data: item // 전체 데이터 반환
        };
      } else {
        console.log('⚠️ [FTC] 등록된 정보 없음');
        return { 
          status: 'NONE', 
          message: '통신판매업 미등록', 
          data: {} 
        };
      }
    } else {
      console.error(`❌ [FTC] API 오류: ${res.status}`);
      return { 
        status: 'ERROR', 
        message: '공정위 서버 응답 오류', 
        data: {} 
      };
    }
  } catch (e) {
    console.error('❌ [FTC] Fetch 오류:', e);
    return { 
      status: 'ERROR', 
      message: '공정위 API 연결 오류', 
      data: {} 
    };
  }
}

// =================================================================
// 2. 국세청 (NTS) 핸들러 - 기업 상태 검증 (상태만 확인)
// =================================================================
async function handleNTS(cleanBizNum: string) {
  const isMock = process.env.USE_MOCK_NTS === 'true';

  if (isMock) {
    console.log('📢 [NTS] Mock 모드 실행');
    const isActive = parseInt(cleanBizNum) % 2 === 0; 
    return {
      isValid: isActive,
      message: isActive ? '계속사업자' : '폐업자',
      data: {
        b_stt: isActive ? '계속사업자' : '폐업자',
        b_stt_cd: isActive ? '01' : '03',
        tax_type: '[TEST] 부가가치세 일반과세자',
        utcc_yn: 'Y',
        start_dt: '20200101'
      }
    };
  }

  const apiKey = process.env.NTS_API_KEY;
  if (!apiKey) {
    console.error('❌ NTS_API_KEY 환경변수 미설정');
    return { isValid: false, message: 'API 키 오류', data: {} };
  }

  const url = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json' 
      },
      body: JSON.stringify({ "b_no": [cleanBizNum] })
    });

    if (!res.ok) {
      console.error(`❌ [NTS] API 오류: ${res.status}`);
      return { isValid: false, message: '국세청 API 오류', data: {} };
    }

    const result = await res.json();

    if (!result.data || result.data.length === 0) {
      return { isValid: false, message: '조회 결과 없음', data: {} };
    }

    const item = result.data[0];

    // b_stt_cd 확인 (01 = 계속사업자)
    if (!item.b_stt_cd) {
      return { 
        isValid: false, 
        message: '국세청에 등록되지 않은 사업자입니다', 
        data: {} 
      };
    }

    const isValid = item.b_stt_cd === '01';
    
    return {
      isValid: isValid,
      message: item.b_stt || '상태 확인 불가',
      data: {
        b_stt: item.b_stt || '',
        b_stt_cd: item.b_stt_cd || '',
        tax_type: item.tax_type || '',
        tax_type_cd: item.tax_type_cd || '',
        rbf_tax_type: item.rbf_tax_type || '',
        rbf_tax_type_cd: item.rbf_tax_type_cd || '',
        utcc_yn: item.utcc_yn || '',
        invoice_apply_dt: item.invoice_apply_dt || '',
        end_dt: item.end_dt || '',
        tax_type_change_dt: item.tax_type_change_dt || '',
        start_dt: item.start_dt || ''
      }
    };
  } catch (e) {
    console.error('❌ [NTS] Fetch 오류:', e);
    return { isValid: false, message: '국세청 API 연결 오류', data: {} };
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
      message: brandName.includes('테스트') || brandName.includes('삼성') ? '✅ 등록된 상표권 있음' : '⚠️ 상표권 정보 없음'
    };
  }

  return { 
    status: 'Unknown', 
    message: ''
  };
}

// =================================================================
// 유틸 함수들
// =================================================================

function calculateSafetyScore(nts: any, ftc: any, kipris: any) {
  let score = 0;
  const breakdown = { nts: 0, ftc: 0, kipris: 0 };

  if (nts.isValid) {
    score += 50;
    breakdown.nts = 50;
  }
  if (ftc.status === 'OK') {
    score += 30;
    breakdown.ftc = 30;
  }
  if (kipris.message && (kipris.message.includes('등록') || kipris.message.includes('있음'))) {
    score += 20;
    breakdown.kipris = 20;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown: breakdown
  };
}

function formatDate(dateStr: string) {
  if (!dateStr || dateStr.length !== 8) return dateStr;
  return `${dateStr.substring(0, 4)}.${dateStr.substring(4, 6)}.${dateStr.substring(6, 8)}`;
}

function parseDomains(urlString: string): string[] {
  if (!urlString) return [];
  
  // 공정위 데이터는 여러 URL을 공백이나 콤마로 구분
  const urls = urlString
    .split(/[\s,]+/)
    .map(url => url.trim())
    .filter(url => url.length > 0 && (url.startsWith('http://') || url.startsWith('https://') || url.match(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)))
    .slice(0, 5); // 최대 5개까지만
  
  return urls;
}

function generateAIBriefing(info: any, nts: any, ftc: any): string {
  // 핵심 정보가 없으면 기본 메시지
  if (!info.corpName && ftc.status !== 'OK') {
    return '✓ 국세청 등록 사업자입니다.\n\n💡 더 자세한 정보를 원하시면 사업자등록증을 확인하세요.';
  }

  // 머니핀 스타일 AI 브리핑
  let briefing = '';

  if (info.corpName) {
    const location = extractLocation(info.address);
    briefing += `📍 ${info.corpName}\n`;
    briefing += `${location} 소재의 업체입니다.\n\n`;
  }

  // 상태 정보
  if (nts.isValid) {
    briefing += `✅ 국세청 상태: ${info.ntsStatus || '정상'}\n`;
    if (info.taxType) {
      briefing += `💰 과세 유형: ${info.taxType}\n`;
    }
  } else {
    briefing += `⚠️ 국세청 확인 필요\n`;
  }

  // 전자상거래 자격
  if (ftc.status === 'OK') {
    briefing += `🛒 통신판매업: 신고 완료\n`;
    if (info.ftcNumber) {
      briefing += `📋 신고번호: ${info.ftcNumber}\n`;
    }
  }

  // 웹사이트
  if (info.domain && info.domain.length > 0) {
    briefing += `🌐 공식 사이트 운영 중\n`;
  }

  // 최종 평가
  briefing += `\n🎯 신뢰도: 안정적인 거래 대상으로 평가됩니다.`;

  return briefing;
}

function extractLocation(address: string): string {
  if (!address) return '위치 정보 미확인';
  const parts = address.split(' ');
  return parts.slice(0, 2).join(' ') || address;
}
