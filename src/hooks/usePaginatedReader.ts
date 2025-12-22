import { useState, useCallback, useMemo, useEffect, useRef } from 'react';

export interface PaginatedReaderState {
  paragraphs: string[];
  currentParagraphIndex: number;
  currentPageIndex: number;
  pageCount: number;
  paragraphsPerPage: number;
  pageParagraphs: string[];
  currentParagraphOnPage: number;
  
  // Navigation
  goToNextPage: () => void;
  goToPrevPage: () => void;
  goToPage: (pageIndex: number) => void;
  goToParagraph: (paragraphIndex: number) => void;
  selectParagraph: (pageRelativeIndex: number) => void;
  
  // State
  hasNextPage: boolean;
  hasPrevPage: boolean;
  isLastParagraphOnPage: boolean;
}

interface UsePaginatedReaderOptions {
  content: string;
  initialParagraphIndex?: number;
  onParagraphChange?: (paragraphIndex: number) => void;
  containerHeight?: number;
  paragraphHeight?: number;
}

export function usePaginatedReader({
  content,
  initialParagraphIndex = 0,
  onParagraphChange,
  containerHeight = 500,
  paragraphHeight = 150,
}: UsePaginatedReaderOptions): PaginatedReaderState {
  // Pagination strategy
  // We want the page to flip *before* the current paragraph becomes the bottom-most paragraph.
  // To achieve that, pages overlap by 1 full paragraph.
  //
  // - fullParagraphsPerPage: paragraphs that fully fit
  // - pageStep: how many paragraphs we advance when turning a page (fullParagraphsPerPage - 1)
  // - displayParagraphsPerPage: include +1 extra (cut-off) paragraph for visual continuity
  const fullParagraphsPerPage = useMemo(() => {
    return Math.max(1, Math.floor(containerHeight / paragraphHeight));
  }, [containerHeight, paragraphHeight]);

  const pageStep = useMemo(() => {
    // Overlap by 1 paragraph so that when you reach the "last" paragraph of a page,
    // it becomes the first paragraph of the next page.
    return Math.max(1, fullParagraphsPerPage - 1);
  }, [fullParagraphsPerPage]);

  const displayParagraphsPerPage = useMemo(() => {
    return fullParagraphsPerPage + 1; // Show one additional cut-off paragraph
  }, [fullParagraphsPerPage]);

  // Split content into paragraphs
  const paragraphs = useMemo(() => {
    return content
      .split('\n\n')
      .filter((p) => p.trim())
      .map((p) => p.trim());
  }, [content]);

  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(initialParagraphIndex);
  const prevParagraphIndexRef = useRef(currentParagraphIndex);

  // Notify on paragraph changes
  useEffect(() => {
    if (currentParagraphIndex !== prevParagraphIndexRef.current) {
      prevParagraphIndexRef.current = currentParagraphIndex;
      onParagraphChange?.(currentParagraphIndex);
    }
  }, [currentParagraphIndex, onParagraphChange]);

  // Pages are defined by a sliding window:
  // pageStartIndex = pageIndex * pageStep
  const pageCount = useMemo(() => {
    if (paragraphs.length === 0) return 0;
    return Math.floor((paragraphs.length - 1) / pageStep) + 1;
  }, [paragraphs.length, pageStep]);

  const currentPageIndex = useMemo(() => {
    if (paragraphs.length === 0) return 0;
    const idx = Math.floor(currentParagraphIndex / pageStep);
    return Math.min(Math.max(idx, 0), Math.max(0, pageCount - 1));
  }, [currentParagraphIndex, pageStep, pageCount, paragraphs.length]);

  const pageStartIndex = useMemo(() => {
    return currentPageIndex * pageStep;
  }, [currentPageIndex, pageStep]);

  // Get paragraphs for the current page (includes cut-off)
  const pageParagraphs = useMemo(() => {
    const startIndex = pageStartIndex;
    const endIndex = Math.min(startIndex + displayParagraphsPerPage, paragraphs.length);
    return paragraphs.slice(startIndex, endIndex);
  }, [paragraphs, pageStartIndex, displayParagraphsPerPage]);

  // Position of current paragraph on this page (0-based)
  const currentParagraphOnPage = useMemo(() => {
    return Math.max(0, currentParagraphIndex - pageStartIndex);
  }, [currentParagraphIndex, pageStartIndex]);

  // For compatibility; in this pagination model, the "last paragraph on page" is rarely the current one
  // because we intentionally flip earlier (via overlap). Keep it useful for last-page cases.
  const isLastParagraphOnPage = useMemo(() => {
    const lastFullIndex = Math.min(fullParagraphsPerPage - 1, pageParagraphs.length - 1);
    return currentParagraphOnPage === lastFullIndex;
  }, [currentParagraphOnPage, fullParagraphsPerPage, pageParagraphs.length]);

  // Navigation functions
  const goToNextPage = useCallback(() => {
    const nextPageIndex = currentPageIndex + 1;
    if (nextPageIndex < pageCount) {
      const newParagraphIndex = nextPageIndex * pageStep;
      setCurrentParagraphIndex(Math.min(newParagraphIndex, Math.max(0, paragraphs.length - 1)));
    }
  }, [currentPageIndex, pageCount, pageStep, paragraphs.length]);

  const goToPrevPage = useCallback(() => {
    const prevPageIndex = currentPageIndex - 1;
    if (prevPageIndex >= 0) {
      const newParagraphIndex = prevPageIndex * pageStep;
      setCurrentParagraphIndex(newParagraphIndex);
    }
  }, [currentPageIndex, pageStep]);

  const goToPage = useCallback(
    (pageIndex: number) => {
      if (pageIndex >= 0 && pageIndex < pageCount) {
        const newParagraphIndex = pageIndex * pageStep;
        setCurrentParagraphIndex(Math.min(newParagraphIndex, Math.max(0, paragraphs.length - 1)));
      }
    },
    [pageCount, pageStep, paragraphs.length]
  );

  const goToParagraph = useCallback(
    (paragraphIndex: number) => {
      if (paragraphIndex >= 0 && paragraphIndex < paragraphs.length) {
        setCurrentParagraphIndex(paragraphIndex);
      }
    },
    [paragraphs.length]
  );

  // Select a paragraph by its position on the current page (including cut-off)
  const selectParagraph = useCallback(
    (pageRelativeIndex: number) => {
      const absoluteIndex = pageStartIndex + pageRelativeIndex;
      if (absoluteIndex >= 0 && absoluteIndex < paragraphs.length) {
        setCurrentParagraphIndex(absoluteIndex);
      }
    },
    [pageStartIndex, paragraphs.length]
  );

  // Reset to initial paragraph when content changes (new chapter)
  useEffect(() => {
    setCurrentParagraphIndex(initialParagraphIndex);
    prevParagraphIndexRef.current = initialParagraphIndex;
  }, [content, initialParagraphIndex]);

  return {
    paragraphs,
    currentParagraphIndex,
    currentPageIndex,
    pageCount,
    paragraphsPerPage: fullParagraphsPerPage,
    pageParagraphs,
    currentParagraphOnPage,

    goToNextPage,
    goToPrevPage,
    goToPage,
    goToParagraph,
    selectParagraph,

    hasNextPage: currentPageIndex < pageCount - 1,
    hasPrevPage: currentPageIndex > 0,
    isLastParagraphOnPage,
  };
}
