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
    // STEP 3: 특허청 (KIPRIS) 조회 -> 상표/특허 정보
    // =================================================================
    const targetBrandName = brandName || businessInfo.corpName;
    let kiprisTrademark: any = { status: 'Skip', message: '검색어 없음', raw: null };
    let kiprisPatent: any = { status: 'Skip', message: '검색어 없음', raw: null };
    let kiprisTmHistory: any = { status: 'Skip', message: '출원번호 없음', raw: null };

    if (targetBrandName) {
      kiprisTrademark = await handleKIPRIS(targetBrandName);
      businessInfo.brandName = targetBrandName;

      // 특허·실용 검색
      kiprisPatent = await handleKIPRISPatent(targetBrandName);

      // 상표 행정처리 이력 (상표 검색 결과의 출원번호 기준)
      const tmApplicationNumber = kiprisTrademark.applicationNumber;
      if (tmApplicationNumber) {
        kiprisTmHistory = await handleKIPRISTrademarkHistory(tmApplicationNumber);
      }
    }
    
    // 신뢰도 점수 계산 (상표 검색 결과 기준)
    const safetyScore = calculateSafetyScore(ntsResult, ftcResult, kiprisTrademark);
    
    // 기업정보 요약 생성
    const summaryText = generateCompanyBriefing(businessInfo, ntsResult, ftcResult);
    
    return NextResponse.json({
      success: true,
      data: {
        safetyScore,
        businessInfo,
        summary: summaryText,
        bizStatus: ntsResult.message,
        onlineLicense: ftcResult.message,
        brandRight: kiprisTrademark.message,
        sources: {
          nts: ntsResult,
          ftc: ftcResult,
          kiprisTrademark,
          kiprisPatent,
          kiprisTmHistory
        }
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
        console.log('[FTC] 등록된 정보 없음');
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
      message: brandName.includes('테스트') || brandName.includes('삼성') ? '등록된 상표권이 있습니다.' : '상표권 정보가 없습니다.',
      raw: null
    };
  }

  const apiKey = process.env.KIPRIS_API_KEY;
  if (!apiKey) {
    console.error('❌ KIPRIS_API_KEY 환경변수 미설정');
    return { 
      status: 'ConfigError', 
      message: '특허청(KIPRIS) API 키가 설정되지 않았습니다. 관리자에게 문의해 주세요.',
      raw: null
    };
  }

  // 상표 출원 속보 - 단어 검색(getWordSearch) 사용
  const baseUrl = 'http://plus.kipris.or.kr/kipo-api/kipi/trademarkInfoSearchService/getWordSearch';

  const params = new URLSearchParams({
    searchString: brandName,
    searchRecentYear: '0',   // 전체 기간
    numOfRows: '20',
    pageNo: '1',
    ServiceKey: apiKey
  });

  try {
    console.log('🚀 [KIPRIS] 상표 검색 호출:', brandName);
    const res = await fetch(`${baseUrl}?${params.toString()}`, {
      method: 'GET'
    });

    const xmlText = await res.text();

    if (!res.ok) {
      console.error('❌ [KIPRIS] HTTP 오류:', res.status);
      return {
        status: 'Error',
        message: '특허청 상표 API 응답 오류',
        raw: xmlText
      };
    }

    // 기본 응답 코드 확인
    const resultCode = extractXmlTag(xmlText, 'resultCode');
    if (resultCode && resultCode !== '00') {
      const resultMsg = extractXmlTag(xmlText, 'resultMsg') || 'KIPRIS 오류';
      return {
        status: 'Error',
        message: `특허청 상표 API 오류: ${resultMsg}`,
        raw: xmlText
      };
    }

    // 첫 번째 item 기준으로 요약 생성
    const firstItemXml = extractFirstItem(xmlText);
    if (!firstItemXml) {
      return {
        status: 'NotFound',
        message: '해당 명칭으로 조회된 상표 출원/등록 정보가 없습니다.',
        raw: xmlText
      };
    }

    const title = extractXmlTag(firstItemXml, 'title');
    const applicationStatus = extractXmlTag(firstItemXml, 'applicationStatus');
    const applicantName = extractXmlTag(firstItemXml, 'applicantName');
    const registrationNumber = extractXmlTag(firstItemXml, 'registrationNumber');
    const registrationDate = extractXmlTag(firstItemXml, 'registrationDate');
    const applicationNumber = extractXmlTag(firstItemXml, 'applicationNumber');

    let message = '';
    if (applicationStatus.includes('등록')) {
      message =
        `• 대상 명칭: '${brandName}' (또는 유사 표현)\n` +
        `• 등록 여부: 등록된 상표가 확인되었습니다.\n` +
        `• 상표명: ${title || '정보 없음'}\n` +
        `• 출원인: ${applicantName || '정보 없음'}\n` +
        `• 등록번호: ${registrationNumber || '정보 없음'}\n` +
        (registrationDate ? `• 등록일자: ${registrationDate}\n` : '');
    } else if (applicationStatus.includes('출원') || applicationStatus.includes('공고')) {
      message =
        `• 대상 명칭: '${brandName}' (또는 유사 표현)\n` +
        `• 등록 여부: 출원 또는 심사 단계의 상표가 있습니다.\n` +
        `• 상표명: ${title || '정보 없음'}\n` +
        `• 출원인: ${applicantName || '정보 없음'}\n` +
        `• 현재 상태: ${applicationStatus}`;
    } else {
      message =
        `• 대상 명칭: '${brandName}'\n` +
        `• 등록 여부: 뚜렷한 등록 상표는 확인되지 않았습니다.\n` +
        `• 가장 근접한 상표명: ${title || '정보 없음'}\n` +
        (applicationStatus ? `• 상태: ${applicationStatus}` : '');
    }

    return {
      status: 'OK',
      message,
      applicationNumber,
      raw: xmlText
    };
  } catch (e) {
    console.error('❌ [KIPRIS] Fetch 오류:', e);
    return {
      status: 'Error',
      message: '특허청 상표 API 연결 오류',
      raw: null
    };
  }
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

// 특허·실용 공개·등록공보 - 단어 검색
async function handleKIPRISPatent(word: string) {
  const apiKey = process.env.KIPRIS_API_KEY;
  if (!apiKey) {
    return {
      status: 'ConfigError',
      message: 'KIPRIS API 키 미설정으로 특허·실용 조회를 수행할 수 없습니다.',
      raw: null
    };
  }

  const baseUrl = 'http://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice/getWordSearch';

  const params = new URLSearchParams({
    word,
    year: '0',       // 전체 기간
    patent: 'true',  // 특허 포함
    utility: 'true', // 실용 포함
    numOfRows: '20',
    pageNo: '1',
    ServiceKey: apiKey
  });

  try {
    console.log('🚀 [KIPRIS] 특허/실용 검색 호출:', word);
    const res = await fetch(`${baseUrl}?${params.toString()}`, {
      method: 'GET'
    });

    const xmlText = await res.text();

    if (!res.ok) {
      console.error('❌ [KIPRIS] 특허/실용 HTTP 오류:', res.status);
      return {
        status: 'Error',
        message: '특허·실용 공개·등록공보 API 응답 오류',
        raw: xmlText
      };
    }

    const resultCode = extractXmlTag(xmlText, 'resultCode');
    if (resultCode && resultCode !== '00') {
      const resultMsg = extractXmlTag(xmlText, 'resultMsg') || 'KIPRIS 특허/실용 오류';
      return {
        status: 'Error',
        message: `특허·실용 API 오류: ${resultMsg}`,
        raw: xmlText
      };
    }

    const firstItemXml = extractFirstItem(xmlText);
    if (!firstItemXml) {
      return {
        status: 'NotFound',
        message: '해당 단어로 조회된 특허·실용 공보가 없습니다.',
        raw: xmlText
      };
    }

    const inventionTitle = extractXmlTag(firstItemXml, 'inventionTitle');
    const registerStatus = extractXmlTag(firstItemXml, 'registerStatus');
    const registerNumber = extractXmlTag(firstItemXml, 'registerNumber');
    const registerDate = extractXmlTag(firstItemXml, 'registerDate');
    const applicantName = extractXmlTag(firstItemXml, 'applicantName');

    let message = '';
    if (registerStatus.includes('등록')) {
      message =
        `• 검색어: '${word}'\n` +
        `• 등록 여부: 관련 등록 특허/실용 공보가 있습니다.\n` +
        `• 발명의 명칭: ${inventionTitle || '정보 없음'}\n` +
        `• 출원인: ${applicantName || '정보 없음'}\n` +
        `• 등록번호: ${registerNumber || '정보 없음'}\n` +
        (registerDate ? `• 등록일자: ${registerDate}` : '');
    } else {
      message =
        `• 검색어: '${word}'\n` +
        `• 등록 여부: 관련 등록 특허/실용 공보는 확인되지 않았습니다.\n` +
        `• 가장 근접한 발명의 명칭: ${inventionTitle || '정보 없음'}\n` +
        (registerStatus ? `• 상태: ${registerStatus}` : '');
    }

    return {
      status: 'OK',
      message,
      raw: xmlText
    };
  } catch (e) {
    console.error('❌ [KIPRIS] 특허/실용 Fetch 오류:', e);
    return {
      status: 'Error',
      message: '특허·실용 공개·등록공보 API 연결 오류',
      raw: null
    };
  }
}

// 상표 행정처리 이력
async function handleKIPRISTrademarkHistory(applicationNumber: string) {
  const apiKey = process.env.KIPRIS_API_KEY;
  if (!apiKey) {
    return {
      status: 'ConfigError',
      message: 'KIPRIS API 키 미설정으로 상표 행정처리 이력을 조회할 수 없습니다.',
      raw: null
    };
  }

  const baseUrl = 'http://plus.kipris.or.kr/openapi/rest/RelatedDocsonfileTMService/relatedDocsonfileInfo';
  const params = new URLSearchParams({
    applicationNumber,
    accessKey: apiKey
  });

  try {
    console.log('🚀 [KIPRIS] 상표 행정처리 이력 조회:', applicationNumber);
    const res = await fetch(`${baseUrl}?${params.toString()}`, {
      method: 'GET'
    });

    const xmlText = await res.text();

    if (!res.ok) {
      console.error('❌ [KIPRIS] 상표 이력 HTTP 오류:', res.status);
      return {
        status: 'Error',
        message: '상표 행정처리 이력 API 응답 오류',
        raw: xmlText
      };
    }

    const resultCode = extractXmlTag(xmlText, 'resultCode');
    if (resultCode && resultCode !== '00') {
      const resultMsg = extractXmlTag(xmlText, 'resultMsg') || '상표 이력 API 오류';
      return {
        status: 'Error',
        message: `상표 행정처리 이력 API 오류: ${resultMsg}`,
        raw: xmlText
      };
    }

    // 한두 개 이력을 간단 요약 (가장 첫 이력 기준)
    const firstInfoXml = extractFirstCustomItem(xmlText, 'relateddocsonfileInfo');
    if (!firstInfoXml) {
      return {
        status: 'NotFound',
        message: '해당 출원번호에 대한 행정처리 이력이 없습니다.',
        raw: xmlText
      };
    }

    const documentTitle = extractXmlTag(firstInfoXml, 'documentTitle');
    const status = extractXmlTag(firstInfoXml, 'status');
    const step = extractXmlTag(firstInfoXml, 'step');

    const message = `상표 행정처리 이력이 확인되었습니다.\n` +
      (step ? `• 단계: ${step}\n` : '') +
      (status ? `• 처리상태: ${status}\n` : '') +
      (documentTitle ? `• 대표 서류: ${documentTitle}` : '');

    return {
      status: 'OK',
      message,
      raw: xmlText
    };
  } catch (e) {
    console.error('❌ [KIPRIS] 상표 이력 Fetch 오류:', e);
    return {
      status: 'Error',
      message: '상표 행정처리 이력 API 연결 오류',
      raw: null
    };
  }
}

// 간단한 XML 파서 유틸 (외부 라이브러리 없이 태그 내용 추출)
function extractXmlTag(xml: string, tagName: string): string {
  if (!xml) return '';
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`);
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

function extractFirstItem(xml: string): string | null {
  if (!xml) return null;
  const match = xml.match(/<item>([\s\S]*?)<\/item>/);
  return match ? match[1] : null;
}

function extractFirstCustomItem(xml: string, tagName: string): string | null {
  if (!xml) return null;
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`);
  const match = xml.match(regex);
  return match ? match[1] : null;
}

function generateCompanyBriefing(info: any, nts: any, ftc: any): string {
  // 핵심 정보가 없으면 기본 메시지
  if (!info.corpName && ftc.status !== 'OK') {
    return '국세청 등록 사업자입니다.\n\n더 자세한 정보를 원하시면 사업자등록증을 확인하세요.';
  }

  // 기업정보 요약
  let briefing = '';

  if (info.corpName) {
    const location = extractLocation(info.address);
    briefing += `${info.corpName}\n`;
    briefing += `${location} 소재의 업체입니다.\n\n`;
  }

  // 상태 정보
  if (nts.isValid) {
    briefing += `• 국세청 상태: ${info.ntsStatus || '정상'}\n`;
    if (info.taxType) {
      briefing += `• 과세 유형: ${info.taxType}\n`;
    }
  } else {
    briefing += `• 국세청 확인 필요\n`;
  }

  // 전자상거래 자격
  if (ftc.status === 'OK') {
    briefing += `• 통신판매업: 신고 완료\n`;
    if (info.ftcNumber) {
      briefing += `• 신고번호: ${info.ftcNumber}\n`;
    }
  }

  // 웹사이트
  if (info.domain && info.domain.length > 0) {
    briefing += `• 공식 사이트 운영 중\n`;
  }

  // 신뢰도 평가
  briefing += `\n안정적인 거래 대상으로 평가됩니다.`;

  return briefing;
}

function extractLocation(address: string): string {
  if (!address) return '위치 정보 미확인';
  const parts = address.split(' ');
  return parts.slice(0, 2).join(' ') || address;
}
