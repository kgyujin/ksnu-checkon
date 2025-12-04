/**
 * Google Analytics 설정 및 이벤트 로깅
 * 
 * 의도를 분명히 하는 상수와 함수 네이밍을 통해 GA 데이터 수집 의도를 명확히 표현
 */

export const GOOGLE_ANALYTICS_MEASUREMENT_ID = "G-R9DFYNXWGN";

/**
 * Google Analytics 이벤트 파라미터
 * 
 * 각 속성이 의도를 명확히 표현하도록 이름을 지음:
 * - action: 사용자가 수행한 구체적 액션
 * - category: 액션이 속한 기능 영역
 * - label: 추가적 컨텍스트
 * - value: 수치화된 측정값
 */
interface AnalyticsEventParams {
  action: string;
  category?: string;
  label?: string;
  value?: number;
}

/**
 * Google Analytics 이벤트 기록 함수
 * 
 * CQS 원칙에 따라:
 * - 쿼리: isGoogleAnalyticsAvailable (내부 검증)
 * - 명령: sendAnalyticsEvent (데이터 전송)
 */
export function logEvent(eventParams: AnalyticsEventParams): void {
  if (!isGoogleAnalyticsAvailable()) {
    return;
  }

  sendAnalyticsEvent(eventParams);
}

/**
 * Google Analytics 사용 가능 여부 확인
 * 
 * 조건 캡슐화: window와 gtag 존재 여부를 하나의 의미있는 함수로 표현
 */
function isGoogleAnalyticsAvailable(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const windowWithGtag = window as any;
  return typeof windowWithGtag.gtag === "function";
}

/**
 * Google Analytics 이벤트 전송
 * 
 * 명령 역할만 수행: 이벤트 데이터를 GA에 전송
 */
function sendAnalyticsEvent(eventParams: AnalyticsEventParams): void {
  const windowWithGtag = window as any;

  windowWithGtag.gtag("event", eventParams.action, {
    event_category: eventParams.category,
    event_label: eventParams.label,
    value: eventParams.value,
  });
}


