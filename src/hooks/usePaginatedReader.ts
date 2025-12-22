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
  // Calculate dynamic paragraphs per page based on container height
  // Add 1 extra paragraph to show cut-off at bottom
  const paragraphsPerPage = useMemo(() => {
    const calculated = Math.max(1, Math.floor(containerHeight / paragraphHeight)) + 1;
    return calculated;
  }, [containerHeight, paragraphHeight]);
  // Split content into paragraphs
  const paragraphs = useMemo(() => {
    return content
      .split('\n\n')
      .filter(p => p.trim())
      .map(p => p.trim());
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

  // Calculate page info
  const pageCount = useMemo(() => {
    return Math.ceil(paragraphs.length / paragraphsPerPage);
  }, [paragraphs.length, paragraphsPerPage]);

  const currentPageIndex = useMemo(() => {
    return Math.floor(currentParagraphIndex / paragraphsPerPage);
  }, [currentParagraphIndex, paragraphsPerPage]);

  // Get paragraphs for the current page
  const pageParagraphs = useMemo(() => {
    const startIndex = currentPageIndex * paragraphsPerPage;
    const endIndex = Math.min(startIndex + paragraphsPerPage, paragraphs.length);
    return paragraphs.slice(startIndex, endIndex);
  }, [paragraphs, currentPageIndex, paragraphsPerPage]);

  // Position of current paragraph on this page (0-based)
  const currentParagraphOnPage = useMemo(() => {
    return currentParagraphIndex % paragraphsPerPage;
  }, [currentParagraphIndex, paragraphsPerPage]);

  // Check if current paragraph is the last on this page
  const isLastParagraphOnPage = useMemo(() => {
    return currentParagraphOnPage === pageParagraphs.length - 1;
  }, [currentParagraphOnPage, pageParagraphs.length]);

  // Navigation functions
  const goToNextPage = useCallback(() => {
    const nextPageIndex = currentPageIndex + 1;
    if (nextPageIndex < pageCount) {
      const newParagraphIndex = nextPageIndex * paragraphsPerPage;
      setCurrentParagraphIndex(Math.min(newParagraphIndex, paragraphs.length - 1));
    }
  }, [currentPageIndex, pageCount, paragraphsPerPage, paragraphs.length]);

  const goToPrevPage = useCallback(() => {
    const prevPageIndex = currentPageIndex - 1;
    if (prevPageIndex >= 0) {
      const newParagraphIndex = prevPageIndex * paragraphsPerPage;
      setCurrentParagraphIndex(newParagraphIndex);
    }
  }, [currentPageIndex, paragraphsPerPage]);

  const goToPage = useCallback((pageIndex: number) => {
    if (pageIndex >= 0 && pageIndex < pageCount) {
      const newParagraphIndex = pageIndex * paragraphsPerPage;
      setCurrentParagraphIndex(Math.min(newParagraphIndex, paragraphs.length - 1));
    }
  }, [pageCount, paragraphsPerPage, paragraphs.length]);

  const goToParagraph = useCallback((paragraphIndex: number) => {
    if (paragraphIndex >= 0 && paragraphIndex < paragraphs.length) {
      setCurrentParagraphIndex(paragraphIndex);
    }
  }, [paragraphs.length]);

  // Select a paragraph by its position on the current page
  const selectParagraph = useCallback((pageRelativeIndex: number) => {
    const absoluteIndex = currentPageIndex * paragraphsPerPage + pageRelativeIndex;
    if (absoluteIndex >= 0 && absoluteIndex < paragraphs.length) {
      setCurrentParagraphIndex(absoluteIndex);
    }
  }, [currentPageIndex, paragraphsPerPage, paragraphs.length]);

  // Reset to first paragraph when content changes (new chapter)
  useEffect(() => {
    setCurrentParagraphIndex(0);
    prevParagraphIndexRef.current = 0;
  }, [content]);

  return {
    paragraphs,
    currentParagraphIndex,
    currentPageIndex,
    pageCount,
    paragraphsPerPage,
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
