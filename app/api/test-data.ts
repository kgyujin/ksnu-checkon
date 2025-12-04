// API 테스트(공공데이터포털 - 사업자 상태 조회)

export const TEST_BUSINESS_NUMBERS = [
  {
    number: '1234567890', // 10자리
    companyName: '테스트회사',
    ceoName: '테스트',
    status: '계속사업자(01)',
    note: '국세청 샘플 데이터'
  },
  {
    number: '0000000000',
    companyName: '더미데이터',
    ceoName: '테스트',
    status: 'API 테스트용',
    note: '테스트용 데이터'
  }
];