import { NextResponse } from 'next/server';

interface AnalysisRequestBody {
  bizNumber?: string;
  ftcNumber?: string;
  brandName?: string;
}

interface CompanyInformation {
  bizNumber: string;
  corpName: string;
  representative: string;
  address: string;
  ftcNumber: string;
  domain: string[];
  bizType: string;
  bizItem: string;
  ntsStatus: string;
  taxType: string;
  startDt: string;
  utccYn: string;
}

interface ApiResponse {
  status: string;
  message: string;
  data: any;
  isValid?: boolean;
  applicationNumber?: string;
  raw?: any;
}

interface SafetyScoreBreakdown {
  nts: number;
  ftc: number;
  kipris: number;
}

interface SafetyScore {
  score: number;
  breakdown: SafetyScoreBreakdown;
}

export async function POST(request: Request) {
  try {
    const body: AnalysisRequestBody = await request.json();
    
    validateAnalysisRequest(body);

    const cleanBizNum = normalizeBusinessNumber(body.bizNumber || '');
    const companyInfo = initializeCompanyInformation(cleanBizNum);
    
    const ftcResult = await fetchCompanyDetailsFromFTC(cleanBizNum);
    mergeCompanyInfoWithFTCData(companyInfo, ftcResult);
    
    const ntsResult = await verifyCompanyStatusWithNTS(cleanBizNum);
    mergeCompanyInfoWithNTSData(companyInfo, ntsResult);
    
    const brandSearchTerm = body.brandName || companyInfo.corpName;
    const { trademarkResult, patentResult, historyResult } = 
      await searchCompanyIPAssets(brandSearchTerm, companyInfo);
    
    const companyBrief = generateCompanySummary(companyInfo, ntsResult, ftcResult);
    
    return NextResponse.json({
      success: true,
      data: {
        businessInfo: companyInfo,
        summary: companyBrief,
        bizStatus: ntsResult.message,
        onlineLicense: ftcResult.message,
        brandRight: trademarkResult.message,
        sources: {
          nts: ntsResult,
          ftc: ftcResult,
          kiprisTrademark: trademarkResult,
          kiprisPatent: patentResult,
          kiprisTmHistory: historyResult
        }
      }
    });

  } catch (error) {
    console.error('Server Error:', error);
    return NextResponse.json({ success: false, message: '서버 내부 오류' }, { status: 500 });
  }
}

function validateAnalysisRequest(body: AnalysisRequestBody): void {
  if (!body.bizNumber && !body.ftcNumber) {
    throw new Error('사업자등록번호 또는 통신판매업신고번호 중 최소 하나가 필요합니다.');
  }
}

function normalizeBusinessNumber(bizNumber: string): string {
  return bizNumber.replace(/-/g, '');
}

function initializeCompanyInformation(bizNumber: string): CompanyInformation {
  return {
    bizNumber,
    corpName: '',
    representative: '',
    address: '',
    ftcNumber: '',
    domain: [],
    bizType: '',
    bizItem: '',
    ntsStatus: '',
    taxType: '',
    startDt: '',
    utccYn: ''
  };
}

function mergeCompanyInfoWithFTCData(
  companyInfo: CompanyInformation, 
  ftcResult: ApiResponse
): void {
  if (ftcResult.status === 'OK' && ftcResult.data) {
    const ftcData = ftcResult.data;
    companyInfo.corpName = ftcData.bzmnNm || '';
    companyInfo.representative = ftcData.rprsvNm || '';
    companyInfo.address = ftcData.lctnRnAddr || ftcData.lctnAddr || '';
    companyInfo.ftcNumber = ftcData.prmmiMnno || '';
    companyInfo.bizType = ftcData.bzmnRgsSttusSeNm || '';
    companyInfo.bizItem = ftcData.mainPrdtNm || '';
    companyInfo.domain = parseDomainUrls(ftcData.domnCn);
  }
}

function mergeCompanyInfoWithNTSData(
  companyInfo: CompanyInformation, 
  ntsResult: ApiResponse
): void {
  if (ntsResult.isValid && ntsResult.data) {
    companyInfo.ntsStatus = ntsResult.message;
    companyInfo.taxType = ntsResult.data.tax_type || '';
    companyInfo.startDt = formatDateString(ntsResult.data.start_dt) || '';
    companyInfo.utccYn = ntsResult.data.utcc_yn === 'Y' ? '가능' : '불가능';
  } else {
    companyInfo.ntsStatus = ntsResult.message;
  }
}

async function fetchCompanyDetailsFromFTC(bizNumber: string): Promise<ApiResponse> {
  const apiKey = process.env.FTC_API_KEY;
  
  if (!validateApiKeyExists(apiKey, 'FTC_API_KEY')) {
    return createErrorApiResponse('API 키 오류');
  }

  const ftcApiUrl = buildFTCRequestUrl(apiKey, bizNumber);

  try {
    console.log('🚀 [FTC] 공정위 API 호출:', bizNumber);
    
    const response = await executeApiRequestWithTimeout(ftcApiUrl, 15000);
    
    if (!response.ok) {
      console.error(`❌ [FTC] API 오류: ${response.status}`);
      return createErrorApiResponse('공정위 서버 응답 오류');
    }

    const responseData = await response.json();
    const companyItems = extractCompanyItemsFromFTCResponse(responseData);

    if (companyItems.length > 0) {
      return createSuccessApiResponse('통신판매업 신고 확인됨', companyItems[0]);
    } else {
      console.log('[FTC] 등록된 정보 없음');
      return createSuccessApiResponse('통신판매업 미등록', {}, 'NONE');
    }
  } catch (error) {
    console.error('❌ [FTC] Fetch 오류:', error);
    return createErrorApiResponse('공정위 API 연결 오류');
  }
}

function buildFTCRequestUrl(apiKey: string, bizNumber: string): string {
  const baseUrl = 'https://apis.data.go.kr/1130000/MllBsDtl_3Service/getMllBsInfoDetail_3';
  const params = new URLSearchParams({
    serviceKey: apiKey,
    pageNo: '1',
    numOfRows: '10',
    resultType: 'json',
    brno: bizNumber
  });
  return `${baseUrl}?${params.toString()}`;
}

function extractCompanyItemsFromFTCResponse(data: any): any[] {
  let items = data.items || data.response?.body?.items || [];
  return Array.isArray(items) ? items : (items ? [items] : []);
}

async function verifyCompanyStatusWithNTS(bizNumber: string): Promise<ApiResponse> {
  const isMockMode = process.env.USE_MOCK_NTS === 'true';

  if (isMockMode) {
    console.log('📢 [NTS] Mock 모드 실행');
    return generateNTSMockResponse(bizNumber);
  }

  const apiKey = process.env.NTS_API_KEY;
  
  if (!validateApiKeyExists(apiKey, 'NTS_API_KEY')) {
    return createErrorApiResponse('국세청 API 키 오류');
  }

  try {
    const ntsUrl = buildNTSRequestUrl(apiKey);
    const response = await executeNTSApiRequest(ntsUrl, bizNumber);
    
    if (!response.ok) {
      console.error(`❌ [NTS] API 오류: ${response.status}`);
      return createErrorApiResponse('국세청 API 오류');
    }

    const result = await response.json();
    return parseNTSApiResponse(result);
  } catch (error) {
    console.error('❌ [NTS] Fetch 오류:', error);
    return createErrorApiResponse('국세청 API 연결 오류');
  }
}

function buildNTSRequestUrl(apiKey: string): string {
  return `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${apiKey}`;
}

async function executeNTSApiRequest(url: string, bizNumber: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Accept': 'application/json' 
    },
    body: JSON.stringify({ "b_no": [bizNumber] })
  });
}

function parseNTSApiResponse(result: any): ApiResponse {
  if (!result.data || result.data.length === 0) {
    return createErrorApiResponse('조회 결과 없음');
  }

  const businessStatus = result.data[0];
  
  if (!businessStatus.b_stt_cd) {
    return createErrorApiResponse('국세청에 등록되지 않은 사업자입니다');
  }

  const isContinuingBusiness = businessStatus.b_stt_cd === '01';
  
  return {
    status: 'OK',
    isValid: isContinuingBusiness,
    message: businessStatus.b_stt || '상태 확인 불가',
    data: extractNTSStatusData(businessStatus)
  };
}

function extractNTSStatusData(businessStatus: any): any {
  return {
    b_stt: businessStatus.b_stt || '',
    b_stt_cd: businessStatus.b_stt_cd || '',
    tax_type: businessStatus.tax_type || '',
    tax_type_cd: businessStatus.tax_type_cd || '',
    rbf_tax_type: businessStatus.rbf_tax_type || '',
    rbf_tax_type_cd: businessStatus.rbf_tax_type_cd || '',
    utcc_yn: businessStatus.utcc_yn || '',
    invoice_apply_dt: businessStatus.invoice_apply_dt || '',
    end_dt: businessStatus.end_dt || '',
    tax_type_change_dt: businessStatus.tax_type_change_dt || '',
    start_dt: businessStatus.start_dt || ''
  };
}

function generateNTSMockResponse(bizNumber: string): ApiResponse {
  const isActiveCompany = parseInt(bizNumber) % 2 === 0;
  
  return {
    status: 'OK',
    isValid: isActiveCompany,
    message: isActiveCompany ? '계속사업자' : '폐업자',
    data: {
      b_stt: isActiveCompany ? '계속사업자' : '폐업자',
      b_stt_cd: isActiveCompany ? '01' : '03',
      tax_type: '[TEST] 부가가치세 일반과세자',
      utcc_yn: 'Y',
      start_dt: '20200101'
    }
  };
}

interface IPAssetSearchResult {
  trademarkResult: ApiResponse;
  patentResult: ApiResponse;
  historyResult: ApiResponse;
}

async function searchCompanyIPAssets(companyName: string, companyInfo: CompanyInformation): Promise<IPAssetSearchResult> {
  const trademarkResult = await searchTrademarksByName(companyName, companyInfo);
  const patentResult = await searchPatentsByName(companyName, companyInfo);
  
  let historyResult: ApiResponse = { 
    status: 'Skip', 
    message: '출원번호 없음',
    raw: null 
  };
  
  const applicationNumber = trademarkResult.applicationNumber;
  if (applicationNumber) {
    historyResult = await searchTrademarkHistoryByApplicationNumber(applicationNumber);
  }
  
  return { trademarkResult, patentResult, historyResult };
}

async function searchTrademarksByName(brandName: string, companyInfo: CompanyInformation): Promise<ApiResponse> {
  if (!brandName) {
    return { 
      status: 'Skip', 
      message: '검색어 없음',
      raw: null 
    };
  }

  const isMockMode = process.env.USE_MOCK_KIPRIS === 'true';
  if (isMockMode) {
    return generateTrademarkMockResponse(brandName);
  }

  const apiKey = process.env.KIPRIS_API_KEY;
  if (!validateApiKeyExists(apiKey, 'KIPRIS_API_KEY')) {
    return createConfigErrorApiResponse(
      '특허청(KIPRIS) API 키가 설정되지 않았습니다. 관리자에게 문의해 주세요.'
    );
  }

  const kiprisUrl = buildKIPRISTrademarkSearchUrl(apiKey, brandName);

  try {
    console.log('🚀 [KIPRIS] 상표 검색 호출:', brandName);
    const response = await fetch(kiprisUrl, { method: 'GET' });
    const xmlResponseText = await response.text();

    if (!response.ok) {
      console.error('❌ [KIPRIS] HTTP 오류:', response.status);
      return createErrorApiResponse('특허청 상표 API 응답 오류');
    }

    return parseKIPRISTrademarkXmlResponse(xmlResponseText, brandName, companyInfo);
  } catch (error) {
    console.error('❌ [KIPRIS] Fetch 오류:', error);
    return createErrorApiResponse('특허청 상표 API 연결 오류');
  }
}

async function searchPatentsByName(companyName: string, companyInfo: CompanyInformation): Promise<ApiResponse> {
  if (!companyName) {
    return { 
      status: 'Skip', 
      message: '검색어 없음',
      raw: null 
    };
  }

  const apiKey = process.env.KIPRIS_API_KEY;
  if (!validateApiKeyExists(apiKey, 'KIPRIS_API_KEY')) {
    return createConfigErrorApiResponse(
      'KIPRIS API 키 미설정으로 특허·실용 조회를 수행할 수 없습니다.'
    );
  }

  const kiprisUrl = buildKIPRISPatentSearchUrl(apiKey, companyName);

  try {
    console.log('🚀 [KIPRIS] 특허/실용 검색 호출:', companyName);
    const response = await fetch(kiprisUrl, { method: 'GET' });
    const xmlResponseText = await response.text();

    if (!response.ok) {
      console.error('❌ [KIPRIS] 특허/실용 HTTP 오류:', response.status);
      return createErrorApiResponse('특허·실용 공개·등록공보 API 응답 오류');
    }

    return parseKIPRISPatentXmlResponse(xmlResponseText, companyName, companyInfo);
  } catch (error) {
    console.error('❌ [KIPRIS] 특허/실용 Fetch 오류:', error);
    return createErrorApiResponse('특허·실용 공개·등록공보 API 연결 오류');
  }
}

async function searchTrademarkHistoryByApplicationNumber(
  applicationNumber: string
): Promise<ApiResponse> {
  const apiKey = process.env.KIPRIS_API_KEY;
  if (!validateApiKeyExists(apiKey, 'KIPRIS_API_KEY')) {
    return createConfigErrorApiResponse(
      'KIPRIS API 키 미설정으로 상표 행정처리 이력을 조회할 수 없습니다.'
    );
  }

  const kiprisUrl = buildKIPRISTrademarkHistoryUrl(apiKey, applicationNumber);

  try {
    console.log('🚀 [KIPRIS] 상표 행정처리 이력 조회:', applicationNumber);
    const response = await fetch(kiprisUrl, { method: 'GET' });
    const xmlResponseText = await response.text();

    if (!response.ok) {
      console.error('❌ [KIPRIS] 상표 이력 HTTP 오류:', response.status);
      return createErrorApiResponse('상표 행정처리 이력 API 응답 오류');
    }

    return parseKIPRISTrademarkHistoryXmlResponse(xmlResponseText);
  } catch (error) {
    console.error('❌ [KIPRIS] 상표 이력 Fetch 오류:', error);
    return createErrorApiResponse('상표 행정처리 이력 API 연결 오류');
  }
}

function buildKIPRISTrademarkSearchUrl(apiKey: string, brandName: string): string {
  const baseUrl = 'http://plus.kipris.or.kr/kipo-api/kipi/trademarkInfoSearchService/getWordSearch';
  const params = new URLSearchParams({
    searchString: brandName,
    searchRecentYear: '0',
    numOfRows: '20',
    pageNo: '1',
    ServiceKey: apiKey
  });
  return `${baseUrl}?${params.toString()}`;
}

function buildKIPRISPatentSearchUrl(apiKey: string, companyName: string): string {
  const baseUrl = 'http://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice/getWordSearch';
  const params = new URLSearchParams({
    word: companyName,
    year: '0',
    patent: 'true',
    utility: 'true',
    numOfRows: '20',
    pageNo: '1',
    ServiceKey: apiKey
  });
  return `${baseUrl}?${params.toString()}`;
}

function buildKIPRISTrademarkHistoryUrl(apiKey: string, applicationNumber: string): string {
  const baseUrl = 'http://plus.kipris.or.kr/openapi/rest/RelatedDocsonfileTMService/relatedDocsonfileInfo';
  const params = new URLSearchParams({
    applicationNumber,
    accessKey: apiKey
  });
  return `${baseUrl}?${params.toString()}`;
}

function parseKIPRISTrademarkXmlResponse(xmlText: string, brandName: string, companyInfo: CompanyInformation): ApiResponse {
  const resultCode = extractXmlTag(xmlText, 'resultCode');
  
  if (resultCode && resultCode !== '00') {
    const resultMsg = extractXmlTag(xmlText, 'resultMsg') || 'KIPRIS 오류';
    return createErrorApiResponse(`특허청 상표 API 오류: ${resultMsg}`);
  }

  const firstItemXml = extractFirstXmlElement(xmlText, 'item');
  if (!firstItemXml) {
    return {
      status: 'NotFound',
      message: '해당 명칭으로 조회된 상표 출원/등록 정보가 없습니다.',
      raw: xmlText
    };
  }

  const trademarkInfo = extractTrademarkInfoFromXml(firstItemXml);
  
  if (!isApplicantMatching(trademarkInfo.applicantName, companyInfo)) {
    return {
      status: 'NotFound',
      message: `조회된 상표는 검색 대상 회사('${companyInfo.corpName}')가 출원한 것이 아닙니다. (출원인: ${trademarkInfo.applicantName})`,
      raw: xmlText
    };
  }

  const trademarkMessage = generateTrademarkSummaryMessage(brandName, trademarkInfo);
  const applicationNumber = extractXmlTag(firstItemXml, 'applicationNumber');

  return {
    status: 'OK',
    message: trademarkMessage,
    applicationNumber,
    raw: xmlText
  };
}

function parseKIPRISPatentXmlResponse(xmlText: string, companyName: string, companyInfo: CompanyInformation): ApiResponse {
  const resultCode = extractXmlTag(xmlText, 'resultCode');
  
  if (resultCode && resultCode !== '00') {
    const resultMsg = extractXmlTag(xmlText, 'resultMsg') || 'KIPRIS 특허/실용 오류';
    return createErrorApiResponse(`특허·실용 API 오류: ${resultMsg}`);
  }

  const firstItemXml = extractFirstXmlElement(xmlText, 'item');
  if (!firstItemXml) {
    return {
      status: 'NotFound',
      message: '해당 단어로 조회된 특허·실용 공보가 없습니다.',
      raw: xmlText
    };
  }

  const patentInfo = extractPatentInfoFromXml(firstItemXml);
  
  if (!isApplicantMatching(patentInfo.applicantName, companyInfo)) {
    return {
      status: 'NotFound',
      message: `조회된 특허는 검색 대상 회사('${companyInfo.corpName}')가 출원한 것이 아닙니다. (출원인: ${patentInfo.applicantName})`,
      raw: xmlText
    };
  }

  const patentMessage = generatePatentSummaryMessage(companyName, patentInfo);

  return {
    status: 'OK',
    message: patentMessage,
    raw: xmlText
  };
}

function parseKIPRISTrademarkHistoryXmlResponse(xmlText: string): ApiResponse {
  const resultCode = extractXmlTag(xmlText, 'resultCode');
  
  if (resultCode && resultCode !== '00') {
    const resultMsg = extractXmlTag(xmlText, 'resultMsg') || '상표 이력 API 오류';
    return createErrorApiResponse(`상표 행정처리 이력 API 오류: ${resultMsg}`);
  }

  const firstHistoryXml = extractFirstXmlElement(xmlText, 'relateddocsonfileInfo');
  if (!firstHistoryXml) {
    return {
      status: 'NotFound',
      message: '해당 출원번호에 대한 행정처리 이력이 없습니다.',
      raw: xmlText
    };
  }

  const documentTitle = extractXmlTag(firstHistoryXml, 'documentTitle');
  const status = extractXmlTag(firstHistoryXml, 'status');
  const step = extractXmlTag(firstHistoryXml, 'step');

  const historyMessage = `상표 행정처리 이력이 확인되었습니다.\n` +
    (step ? `• 단계: ${step}\n` : '') +
    (status ? `• 처리상태: ${status}\n` : '') +
    (documentTitle ? `• 대표 서류: ${documentTitle}` : '');

  return {
    status: 'OK',
    message: historyMessage,
    raw: xmlText
  };
}

function extractXmlTag(xml: string, tagName: string): string {
  if (!xml) return '';
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`);
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

function extractFirstXmlElement(xml: string, elementName: string): string | null {
  if (!xml) return null;
  const regex = new RegExp(`<${elementName}>([\\s\\S]*?)<\\/${elementName}>`);
  const match = xml.match(regex);
  return match ? match[1] : null;
}

function isApplicantMatching(applicantName: string, companyInfo: CompanyInformation): boolean {
  if (!applicantName || !companyInfo.corpName) {
    return false;
  }

  const normalizeCompanyName = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[.,\-()]/g, '')
      .replace(/주식회사|대표|회사|공장|협회|단체|조합|연구소|센터|원|관|점|점포|스튜디오|카페|바|클럽|매장|지점|본점|지사/g, '');
  };

  const calculateSimilarity = (str1: string, str2: string): number => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  };

  const normalizedApplicant = normalizeCompanyName(applicantName);
  const normalizedCompany = normalizeCompanyName(companyInfo.corpName);
  const normalizedRepresentative = normalizeCompanyName(companyInfo.representative || '');

  const isExactMatch = normalizedApplicant === normalizedCompany;
  const isRepresentativeMatch = normalizedRepresentative && normalizedApplicant === normalizedRepresentative;
  
  const similarity = calculateSimilarity(normalizedApplicant, normalizedCompany);
  const isSimilarMatch = similarity >= 0.85;

  return isExactMatch || isRepresentativeMatch || isSimilarMatch;
}

function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let i = 0; i <= len2; i++) matrix[i][0] = i;

  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      const cost = str1[j - 1] === str2[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i][j - 1] + 1,
        matrix[i - 1][j] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len2][len1];
}

interface TrademarkInfo {
  title: string;
  applicationStatus: string;
  applicantName: string;
  registrationNumber: string;
  registrationDate: string;
}

function extractTrademarkInfoFromXml(itemXml: string): TrademarkInfo {
  return {
    title: extractXmlTag(itemXml, 'title'),
    applicationStatus: extractXmlTag(itemXml, 'applicationStatus'),
    applicantName: extractXmlTag(itemXml, 'applicantName'),
    registrationNumber: extractXmlTag(itemXml, 'registrationNumber'),
    registrationDate: extractXmlTag(itemXml, 'registrationDate')
  };
}

interface PatentInfo {
  inventionTitle: string;
  registerStatus: string;
  applicantName: string;
  registerNumber: string;
  registerDate: string;
}

function extractPatentInfoFromXml(itemXml: string): PatentInfo {
  return {
    inventionTitle: extractXmlTag(itemXml, 'inventionTitle'),
    registerStatus: extractXmlTag(itemXml, 'registerStatus'),
    applicantName: extractXmlTag(itemXml, 'applicantName'),
    registerNumber: extractXmlTag(itemXml, 'registerNumber'),
    registerDate: extractXmlTag(itemXml, 'registerDate')
  };
}

function generateTrademarkSummaryMessage(
  brandName: string,
  info: TrademarkInfo
): string {
  if (info.applicationStatus.includes('등록')) {
    return `• 대상 명칭: '${brandName}' (또는 유사 표현)\n` +
      `• 등록 여부: 등록된 상표가 확인되었습니다.\n` +
      `• 상표명: ${info.title || '정보 없음'}\n` +
      `• 출원인: ${info.applicantName || '정보 없음'}\n` +
      `• 등록번호: ${info.registrationNumber || '정보 없음'}\n` +
      (info.registrationDate ? `• 등록일자: ${info.registrationDate}\n` : '');
  }
  
  if (info.applicationStatus.includes('출원') || info.applicationStatus.includes('공고')) {
    return `• 대상 명칭: '${brandName}' (또는 유사 표현)\n` +
      `• 등록 여부: 출원 또는 심사 단계의 상표가 있습니다.\n` +
      `• 상표명: ${info.title || '정보 없음'}\n` +
      `• 출원인: ${info.applicantName || '정보 없음'}\n` +
      `• 현재 상태: ${info.applicationStatus}`;
  }
  
  return `• 대상 명칭: '${brandName}'\n` +
    `• 등록 여부: 뚜렷한 등록 상표는 확인되지 않았습니다.\n` +
    `• 가장 근접한 상표명: ${info.title || '정보 없음'}\n` +
    (info.applicationStatus ? `• 상태: ${info.applicationStatus}` : '');
}

function generatePatentSummaryMessage(
  companyName: string,
  info: PatentInfo
): string {
  if (info.registerStatus.includes('등록')) {
    return `• 검색어: '${companyName}'\n` +
      `• 등록 여부: 관련 등록 특허/실용 공보가 있습니다.\n` +
      `• 발명의 명칭: ${info.inventionTitle || '정보 없음'}\n` +
      `• 출원인: ${info.applicantName || '정보 없음'}\n` +
      `• 등록번호: ${info.registerNumber || '정보 없음'}\n` +
      (info.registerDate ? `• 등록일자: ${info.registerDate}` : '');
  }
  
  return `• 검색어: '${companyName}'\n` +
    `• 등록 여부: 관련 등록 특허/실용 공보는 확인되지 않았습니다.\n` +
    `• 가장 근접한 발명의 명칭: ${info.inventionTitle || '정보 없음'}\n` +
    (info.registerStatus ? `• 상태: ${info.registerStatus}` : '');
}

// function calculateTrustScore(
//   ntsResult: ApiResponse,
//   ftcResult: ApiResponse,
//   trademarkResult: ApiResponse
// ): SafetyScore {
//   let score = 0;
//   const breakdown: SafetyScoreBreakdown = { nts: 0, ftc: 0, kipris: 0 };
//
//   if (ntsResult.isValid) {
//     score += 50;
//     breakdown.nts = 50;
//   }
//
//   if (ftcResult.status === 'OK') {
//     score += 30;
//     breakdown.ftc = 30;
//   }
//
//   if (isTrademarkRegistered(trademarkResult.message)) {
//     score += 20;
//     breakdown.kipris = 20;
//   }
//
//   return { score, breakdown };
// }

function calculateTrustScore(
  ntsResult: ApiResponse,
  ftcResult: ApiResponse,
  trademarkResult: ApiResponse
): SafetyScore {
  let score = 0;
  const breakdown: SafetyScoreBreakdown = { nts: 0, ftc: 0, kipris: 0 };

  if (ntsResult.isValid) {
    score += 50;
    breakdown.nts = 50;
  }

  if (ftcResult.status === 'OK') {
    score += 30;
    breakdown.ftc = 30;
  }

  if (isTrademarkRegistered(trademarkResult.message)) {
    score += 20;
    breakdown.kipris = 20;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown
  };
}
// }

function isTrademarkRegistered(message: string): boolean {
  return message && (message.includes('등록') || message.includes('있음'));
}

function formatDateString(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return dateStr;
  return `${dateStr.substring(0, 4)}.${dateStr.substring(4, 6)}.${dateStr.substring(6, 8)}`;
}

function parseDomainUrls(urlString: string): string[] {
  if (!urlString) return [];
  
  const urls = urlString
    .split(/[\s,]+/)
    .map((url) => url.trim())
    .filter(
      (url) =>
        url.length > 0 &&
        (url.startsWith('http://') ||
          url.startsWith('https://') ||
          url.match(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/))
    )
    .slice(0, 5);
  
  return urls;
}

function generateCompanySummary(
  companyInfo: CompanyInformation,
  ntsResult: ApiResponse,
  ftcResult: ApiResponse
): string {
  if (!companyInfo.corpName && ftcResult.status !== 'OK') {
    return '국세청 등록 사업자입니다.\n\n더 자세한 정보를 원하시면 사업자등록증을 확인하세요.';
  }

  let summary = '';

  if (companyInfo.corpName) {
    const location = extractLocationFromAddress(companyInfo.address);
    summary += `${companyInfo.corpName}\n`;
    summary += `${location} 소재의 업체입니다.\n\n`;
  }

  summary += generateTrustReasonsSummary(companyInfo, ntsResult, ftcResult);

  return summary;
}

function generateTrustReasonsSummary(
  companyInfo: CompanyInformation,
  ntsResult: ApiResponse,
  ftcResult: ApiResponse
): string {
  const trustReasons: string[] = [];

  if (ntsResult.isValid) {
    const isContinuingBusiness = companyInfo.ntsStatus?.includes('계속');
    if (isContinuingBusiness) {
      trustReasons.push(`• 국세청 상태: 계속사업자 (정상 운영 중)`);
    } else {
      trustReasons.push(`• 국세청 상태: ${companyInfo.ntsStatus || '정상'}`);
    }
    
    if (companyInfo.taxType) {
      trustReasons.push(`• 과세 유형: ${companyInfo.taxType}`);
    }
  } else {
    trustReasons.push(`• 국세청 확인 상태: 미확인`);
  }

  if (ftcResult.status === 'OK') {
    trustReasons.push(`• 통신판매업: 신고 완료 (공정위 확인)`);
    if (companyInfo.ftcNumber) {
      trustReasons.push(`  - 신고번호: ${companyInfo.ftcNumber}`);
    }
  }

  if (companyInfo.domain && companyInfo.domain.length > 0) {
    trustReasons.push(`• 공식 웹사이트: 운영 중 (${companyInfo.domain.length}개)`);
  }

  if (companyInfo.startDt) {
    trustReasons.push(`• 개업일: ${companyInfo.startDt}`);
  }

  const finalSummary = trustReasons.length > 0 
    ? trustReasons.join('\n') + '\n\n이를 바탕으로 일정 수준의 신뢰도를 확인할 수 있습니다.'
    : '조회된 기본 정보를 참고하여 거래 여부를 판단하시기 바랍니다.';

  return finalSummary;
}

function extractLocationFromAddress(address: string): string {
  if (!address) return '위치 정보 미확인';
  const parts = address.split(' ');
  return parts.slice(0, 2).join(' ') || address;
}

function validateApiKeyExists(apiKey: string | undefined, keyName: string): boolean {
  if (!apiKey) {
    console.error(`❌ ${keyName} 환경변수 미설정`);
    return false;
  }
  return true;
}

async function executeApiRequestWithTimeout(
  url: string,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function createSuccessApiResponse(
  message: string,
  data: any,
  status: string = 'OK'
): ApiResponse {
  return { status, message, data };
}

function createErrorApiResponse(message: string): ApiResponse {
  return { status: 'ERROR', message, data: {} };
}

function createConfigErrorApiResponse(message: string): ApiResponse {
  return { status: 'ConfigError', message, data: {}, raw: null };
}

function generateTrademarkMockResponse(brandName: string): ApiResponse {
  const hasTrademarkRegistration = brandName.includes('테스트') || brandName.includes('삼성');
  
  return {
    status: 'Test',
    message: hasTrademarkRegistration
      ? '등록된 상표권이 있습니다.'
      : '상표권 정보가 없습니다.',
    raw: null
  };
}
