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
  // Calculate paragraphs per page:
  // - completeParagraphsPerPage: paragraphs that fit fully (used for page navigation)
  // - displayParagraphsPerPage: includes +1 cut-off paragraph for display
  const completeParagraphsPerPage = useMemo(() => {
    return Math.max(1, Math.floor(containerHeight / paragraphHeight));
  }, [containerHeight, paragraphHeight]);
  
  const displayParagraphsPerPage = useMemo(() => {
    return completeParagraphsPerPage + 1; // Add one cut-off paragraph for display
  }, [completeParagraphsPerPage]);
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

  // Calculate page info - use completeParagraphsPerPage for navigation logic
  const pageCount = useMemo(() => {
    return Math.ceil(paragraphs.length / completeParagraphsPerPage);
  }, [paragraphs.length, completeParagraphsPerPage]);

  const currentPageIndex = useMemo(() => {
    return Math.floor(currentParagraphIndex / completeParagraphsPerPage);
  }, [currentParagraphIndex, completeParagraphsPerPage]);

  // Get paragraphs for the current page - use displayParagraphsPerPage to include cut-off
  const pageParagraphs = useMemo(() => {
    const startIndex = currentPageIndex * completeParagraphsPerPage;
    const endIndex = Math.min(startIndex + displayParagraphsPerPage, paragraphs.length);
    return paragraphs.slice(startIndex, endIndex);
  }, [paragraphs, currentPageIndex, completeParagraphsPerPage, displayParagraphsPerPage]);

  // Position of current paragraph on this page (0-based)
  const currentParagraphOnPage = useMemo(() => {
    return currentParagraphIndex % completeParagraphsPerPage;
  }, [currentParagraphIndex, completeParagraphsPerPage]);

  // Check if current paragraph is the last complete one on this page
  const isLastParagraphOnPage = useMemo(() => {
    return currentParagraphOnPage === completeParagraphsPerPage - 1;
  }, [currentParagraphOnPage, completeParagraphsPerPage]);

  // Navigation functions
  const goToNextPage = useCallback(() => {
    const nextPageIndex = currentPageIndex + 1;
    if (nextPageIndex < pageCount) {
      const newParagraphIndex = nextPageIndex * completeParagraphsPerPage;
      setCurrentParagraphIndex(Math.min(newParagraphIndex, paragraphs.length - 1));
    }
  }, [currentPageIndex, pageCount, completeParagraphsPerPage, paragraphs.length]);

  const goToPrevPage = useCallback(() => {
    const prevPageIndex = currentPageIndex - 1;
    if (prevPageIndex >= 0) {
      const newParagraphIndex = prevPageIndex * completeParagraphsPerPage;
      setCurrentParagraphIndex(newParagraphIndex);
    }
  }, [currentPageIndex, completeParagraphsPerPage]);

  const goToPage = useCallback((pageIndex: number) => {
    if (pageIndex >= 0 && pageIndex < pageCount) {
      const newParagraphIndex = pageIndex * completeParagraphsPerPage;
      setCurrentParagraphIndex(Math.min(newParagraphIndex, paragraphs.length - 1));
    }
  }, [pageCount, completeParagraphsPerPage, paragraphs.length]);

  const goToParagraph = useCallback((paragraphIndex: number) => {
    if (paragraphIndex >= 0 && paragraphIndex < paragraphs.length) {
      setCurrentParagraphIndex(paragraphIndex);
    }
  }, [paragraphs.length]);

  // Select a paragraph by its position on the current page
  const selectParagraph = useCallback((pageRelativeIndex: number) => {
    const absoluteIndex = currentPageIndex * completeParagraphsPerPage + pageRelativeIndex;
    if (absoluteIndex >= 0 && absoluteIndex < paragraphs.length) {
      setCurrentParagraphIndex(absoluteIndex);
    }
  }, [currentPageIndex, completeParagraphsPerPage, paragraphs.length]);

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
    paragraphsPerPage: completeParagraphsPerPage,
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
