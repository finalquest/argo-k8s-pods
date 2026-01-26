type EnglishState = {
  state: 'ENGLISH_MODE';
  query?: string;
  currentPage?: number;
  totalResults?: number;
  resultsPerPage?: number;
  timestamp: number;
};

const isEnglishMode = (state: Record<string, unknown>) => state.state === 'ENGLISH_MODE';

export {
  type EnglishState,
  isEnglishMode,
};
