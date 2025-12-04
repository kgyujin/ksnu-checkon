import { NextResponse } from 'next/server';

const API_TIMEOUT = 15000;
const LOADING_STEP_INTERVAL = 1500;
const MAX_DOMAIN_COUNT = 5;

const SCORE_WEIGHTS = {
  NTS: 50,
  FTC: 30,
  KIPRIS: 20
};

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

// 배지
interface VerificationBadge {
  verification1: {
    name: string;
    verified: boolean;
    reason: string;
  };
  verification2: {
    name: string;
    verified: boolean;
    reason: string;
  };
  verification3: {
    name: string;
    verified: boolean;
    reason: string;
  };
  verificationSummary: string;
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
    const verificationBadges = generateVerificationBadges(companyInfo, ntsResult, ftcResult, trademarkResult, patentResult);
    
    return NextResponse.json({
      success: true,
      data: {
        businessInfo: companyInfo,
        summary: companyBrief,
        bizStatus: ntsResult.message,
        onlineLicense: ftcResult.message,
        brandRight: trademarkResult.message,
        verificationBadges,
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
  
  if (!hasApiKey(apiKey)) {
    return createErrorApiResponse('API 키 오류');
  }

  const ftcApiUrl = buildFTCRequestUrl(apiKey as string, bizNumber);

  try {
    const response = await executeApiRequestWithTimeout(ftcApiUrl, API_TIMEOUT);
    
    if (!response.ok) {
      return createErrorApiResponse('공정위 서버 응답 오류');
    }

    const responseData = await response.json();
    const companyItems = extractFTCItems(responseData);

    if (companyItems.length > 0) {
      return createSuccessApiResponse('통신판매업 신고 확인됨', companyItems[0]);
    } else {
      return createSuccessApiResponse('통신판매업 미등록', {}, 'NONE');
    }
  } catch (error) {
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

function extractFTCItems(data: any): any[] {
  const items = data.items || data.response?.body?.items || [];
  return Array.isArray(items) ? items : [items].filter(Boolean);
}

async function verifyCompanyStatusWithNTS(bizNumber: string): Promise<ApiResponse> {
  const isMockMode = process.env.USE_MOCK_NTS === 'true';

  if (isMockMode) {
    return generateNTSMockResponse(bizNumber);
  }

  const apiKey = process.env.NTS_API_KEY;
  
  if (!hasApiKey(apiKey)) {
    return createErrorApiResponse('국세청 API 키 오류');
  }

  try {
    const ntsUrl = buildNTSRequestUrl(apiKey as string);
    const response = await executeNTSApiRequest(ntsUrl, bizNumber);
    
    if (!response.ok) {
      return createErrorApiResponse('국세청 API 오류');
    }

    const result = await response.json();
    return parseNTSApiResponse(result);
  } catch (error) {
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
    data: {},
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
      data: {},
      raw: null 
    };
  }

  const isMockMode = process.env.USE_MOCK_KIPRIS === 'true';
  if (isMockMode) {
    return generateTrademarkMockResponse(brandName);
  }

  const apiKey = process.env.KIPRIS_API_KEY;
  if (!hasApiKey(apiKey)) {
    return createErrorApiResponse('KIPRIS API 키 미설정');
  }

  const kiprisUrl = buildKIPRISTrademarkSearchUrl(apiKey as string, brandName);

  try {
    const response = await fetch(kiprisUrl, { method: 'GET' });
    const xmlResponseText = await response.text();

    if (!response.ok) {
      return createErrorApiResponse('특허청 상표 API 응답 오류');
    }

    return parseKIPRISTrademarkXmlResponse(xmlResponseText, brandName, companyInfo);
  } catch (error) {
    return createErrorApiResponse('특허청 상표 API 연결 오류');
  }
}

async function searchPatentsByName(companyName: string, companyInfo: CompanyInformation): Promise<ApiResponse> {
  if (!companyName) {
    return { 
      status: 'Skip', 
      message: '검색어 없음',
      data: {},
      raw: null 
    };
  }

  const apiKey = process.env.KIPRIS_API_KEY;
  if (!hasApiKey(apiKey)) {
    return createErrorApiResponse('KIPRIS API 키 미설정');
  }

  const kiprisUrl = buildKIPRISPatentSearchUrl(apiKey as string, companyName);

  try {
    const response = await fetch(kiprisUrl, { method: 'GET' });
    const xmlResponseText = await response.text();

    if (!response.ok) {
      return createErrorApiResponse('특허·실용 공개·등록공보 API 응답 오류');
    }

    return parseKIPRISPatentXmlResponse(xmlResponseText, companyName, companyInfo);
  } catch (error) {
    return createErrorApiResponse('특허·실용 공개·등록공보 API 연결 오류');
  }
}

async function searchTrademarkHistoryByApplicationNumber(
  applicationNumber: string
): Promise<ApiResponse> {
  const apiKey = process.env.KIPRIS_API_KEY;
  if (!hasApiKey(apiKey)) {
    return createErrorApiResponse('KIPRIS API 키 미설정');
  }

  const kiprisUrl = buildKIPRISTrademarkHistoryUrl(apiKey as string, applicationNumber);

  try {
    const response = await fetch(kiprisUrl, { method: 'GET' });
    const xmlResponseText = await response.text();

    if (!response.ok) {
      return createErrorApiResponse('상표 행정처리 이력 API 응답 오류');
    }

    return parseKIPRISTrademarkHistoryXmlResponse(xmlResponseText);
  } catch (error) {
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

  const allItemsXml = extractAllXmlElements(xmlText, 'item');
  if (!allItemsXml || allItemsXml.length === 0) {
    return {
      status: 'NotFound',
      message: '등록된 상표권 정보가 없습니다.',
      data: {},
      raw: xmlText
    };
  }

  const validItems = allItemsXml.filter(itemXml => {
    const trademarkInfo = extractTrademarkInfoFromXml(itemXml);
    return isApplicantMatching(trademarkInfo.applicantName, companyInfo);
  });

  if (validItems.length > 0) {
    const firstValidItemXml = validItems[0];
    const trademarkInfo = extractTrademarkInfoFromXml(firstValidItemXml);
    const trademarkMessage = generateTrademarkSummaryMessage(brandName, trademarkInfo);
    const applicationNumber = extractXmlTag(firstValidItemXml, 'applicationNumber');

    return {
      status: 'OK',
      message: trademarkMessage,
      data: { applicationNumber, count: validItems.length },
      applicationNumber,
      raw: xmlText
    };
  }

  // 검색 결과는 있으나 출원인이 일치하지 않는 경우 = 없는 것으로 처리
  return {
    status: 'NotFound',
    message: '등록된 상표권 정보가 없습니다.',
    data: {},
    raw: xmlText
  };
}

function parseKIPRISPatentXmlResponse(xmlText: string, companyName: string, companyInfo: CompanyInformation): ApiResponse {
  const resultCode = extractXmlTag(xmlText, 'resultCode');
  
  if (resultCode && resultCode !== '00') {
    const resultMsg = extractXmlTag(xmlText, 'resultMsg') || 'KIPRIS 특허/실용 오류';
    return createErrorApiResponse(`특허·실용 API 오류: ${resultMsg}`);
  }

  const allItemsXml = extractAllXmlElements(xmlText, 'item');
  if (!allItemsXml || allItemsXml.length === 0) {
    return {
      status: 'NotFound',
      message: '등록된 특허·실용신안 정보가 없습니다.',
      data: {},
      raw: xmlText
    };
  }

  const validItems = allItemsXml.filter(itemXml => {
    const patentInfo = extractPatentInfoFromXml(itemXml);
    return isApplicantMatching(patentInfo.applicantName, companyInfo);
  });

  if (validItems.length > 0) {
    const firstValidItemXml = validItems[0];
    const patentInfo = extractPatentInfoFromXml(firstValidItemXml);
    const patentMessage = generatePatentSummaryMessage(companyName, patentInfo);

    return {
      status: 'OK',
      message: patentMessage,
      data: { count: validItems.length },
      raw: xmlText
    };
  }

  // 검색 결과는 있으나 출원인이 일치하지 않는 경우 = 없는 것으로 처리
  return {
    status: 'NotFound',
    message: '등록된 특허·실용신안 정보가 없습니다.',
    data: {},
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
      data: {},
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
    data: {},
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

function extractAllXmlElements(xml: string, elementName: string): string[] {
  if (!xml) return [];
  const regex = new RegExp(`<${elementName}>([\\s\\S]*?)<\\/${elementName}>`, 'g');
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

function isApplicantMatching(applicantName: string, companyInfo: CompanyInformation): boolean {
  if (!applicantName || !companyInfo.corpName) {
    return false;
  }

  const normalizeCompanyName = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/\(주\)/g, '')
      .replace(/\(유\)/g, '')
      .replace(/\(사\)/g, '')
      .replace(/주식회사/g, '')
      .replace(/유한회사/g, '')
      .replace(/\s+/g, '')
      .replace(/[.,\-_]/g, '')
      .trim();
  };

  const normalizedApplicant = normalizeCompanyName(applicantName);
  const normalizedCompany = normalizeCompanyName(companyInfo.corpName);

  return normalizedApplicant === normalizedCompany;
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

function calculateTrustScore(
  ntsResult: ApiResponse,
  ftcResult: ApiResponse,
  trademarkResult: ApiResponse
): SafetyScore {
  let score = 0;
  const breakdown: SafetyScoreBreakdown = { nts: 0, ftc: 0, kipris: 0 };

  if (ntsResult.isValid) {
    score += SCORE_WEIGHTS.NTS;
    breakdown.nts = SCORE_WEIGHTS.NTS;
  }

  if (ftcResult.status === 'OK') {
    score += SCORE_WEIGHTS.FTC;
    breakdown.ftc = SCORE_WEIGHTS.FTC;
  }

  if (isTrademarkRegistered(trademarkResult.message)) {
    score += SCORE_WEIGHTS.KIPRIS;
    breakdown.kipris = SCORE_WEIGHTS.KIPRIS;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown
  };
}

function isTrademarkRegistered(message: string): boolean {
  return !!(message && (message.includes('등록') || message.includes('있음')));
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
    .slice(0, MAX_DOMAIN_COUNT);
  
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

function generateVerificationBadges(
  companyInfo: CompanyInformation,
  ntsResult: ApiResponse,
  ftcResult: ApiResponse,
  trademarkResult: ApiResponse,
  patentResult: ApiResponse
): VerificationBadge {
  
  const isContinuingBusiness = companyInfo.ntsStatus?.includes('계속');
  const verification1 = {
    name: '실존성 검증',
    verified: ntsResult.status === 'OK' && isContinuingBusiness,
    reason: isContinuingBusiness 
      ? '국세청 확인: 계속사업자 (정상 운영)'
      : '국세청 상태 미확인 또는 정상 운영 상태 아님'
  };

  const ftcRegistered = ftcResult.status === 'OK';
  const hasDomain = companyInfo.domain && companyInfo.domain.length > 0;
  const verification2 = {
    name: '투명성 검증',
    verified: ftcRegistered && hasDomain,
    reason: ftcRegistered && hasDomain
      ? `공정위 신고 완료 (신고번호: ${companyInfo.ftcNumber || 'N/A'}) + 공식 웹사이트 운영`
      : '공정위 신고 미완료 또는 웹사이트 미운영'
  };

  const hasIntellectualProperty = trademarkResult.status === 'OK' || patentResult.status === 'OK';
  const operatingYears = calculateOperatingYears(companyInfo.startDt);
  const isLongTermBusiness = operatingYears >= 5;
  
  const verification3 = {
    name: '지속성 검증',
    verified: isLongTermBusiness || hasIntellectualProperty,
    reason: isLongTermBusiness
      ? `${operatingYears}년 이상 운영 (개업: ${companyInfo.startDt})`
      : hasIntellectualProperty
      ? '지식재산권 보유 (상표/특허 등록)'
      : '사업 운영 기간 및 IP 정보 미확인'
  };

  const verificationCount = [verification1, verification2, verification3]
    .filter(v => v.verified).length;
  
  let verificationSummary = '';
  if (verificationCount === 3) {
    verificationSummary = `✅ 3단계 검증 완료: 이 회사는 국세청과 공정위에 정상 등록되어 있으며, ${isLongTermBusiness ? `${operatingYears}년 이상 운영` : '지식재산권을 보유'} 중인 신뢰할 수 있는 기업입니다.`;
  } else if (verificationCount === 2) {
    verificationSummary = `⚠️ 2단계 검증 완료: 기본적인 신뢰 요소는 확인되었으나, 일부 검증이 미완료되었습니다. 거래 전 추가 확인을 권장합니다.`;
  } else if (verificationCount === 1) {
    verificationSummary = `❓ 1단계 검증만 완료: 신뢰도가 제한적입니다. 거래 전 충분한 검증을 권장합니다.`;
  } else {
    verificationSummary = `⛔ 검증 실패: 제공된 정보로는 신뢰도를 확인할 수 없습니다.`;
  }

  return {
    verification1,
    verification2,
    verification3,
    verificationSummary
  };
}

function calculateOperatingYears(startDt: string): number {
  if (!startDt) return 0;
  try {
    const startDate = new Date(startDt.substring(0, 4) + '-' + startDt.substring(4, 6) + '-' + startDt.substring(6, 8));
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 365);
  } catch {
    return 0;
  }
}

function extractLocationFromAddress(address: string): string {
  if (!address) return '위치 정보 미확인';
  const parts = address.split(' ');
  return parts.slice(0, 2).join(' ') || address;
}

function hasApiKey(apiKey: string | undefined): boolean {
  return !!apiKey;
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



function generateTrademarkMockResponse(brandName: string): ApiResponse {
  const hasTrademarkRegistration = brandName.includes('테스트') || brandName.includes('삼성');
  
  return {
    status: 'Test',
    message: hasTrademarkRegistration
      ? '등록된 상표권이 있습니다.'
      : '상표권 정보가 없습니다.',
    data: {},
    raw: null
  };
}
