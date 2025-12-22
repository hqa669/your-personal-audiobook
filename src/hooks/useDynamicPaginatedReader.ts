import { useState, useCallback, useMemo, useEffect, useRef, RefObject } from 'react';

export interface DynamicPaginatedReaderState {
  paragraphs: string[];
  currentParagraphIndex: number;
  currentPageIndex: number;
  pageCount: number;
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
  
  // Measurement
  measureParagraphs: () => void;
  paragraphRefs: RefObject<(HTMLDivElement | null)[]>;
}

interface PageRange {
  startIndex: number;
  endIndex: number; // exclusive
}

interface UseDynamicPaginatedReaderOptions {
  content: string;
  initialParagraphIndex?: number;
  onParagraphChange?: (paragraphIndex: number) => void;
  containerHeight: number;
  fallbackParagraphHeight?: number;
}

export function useDynamicPaginatedReader({
  content,
  initialParagraphIndex = 0,
  onParagraphChange,
  containerHeight,
  fallbackParagraphHeight = 120,
}: UseDynamicPaginatedReaderOptions): DynamicPaginatedReaderState {
  // Split content into paragraphs
  const paragraphs = useMemo(() => {
    return content
      .split('\n\n')
      .filter((p) => p.trim())
      .map((p) => p.trim());
  }, [content]);

  // Refs for paragraph elements
  const paragraphRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Measured heights (null = not yet measured, use fallback)
  const [measuredHeights, setMeasuredHeights] = useState<(number | null)[]>([]);
  
  // Previous heights ref to prevent infinite loops
  const previousHeightsRef = useRef<(number | null)[]>([]);

  // Current paragraph index (absolute)
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(initialParagraphIndex);
  const prevParagraphIndexRef = useRef(currentParagraphIndex);

  // Compute pages based on measured heights
  const pages = useMemo<PageRange[]>(() => {
    if (paragraphs.length === 0) return [];

    const heights = paragraphs.map((_, i) => 
      measuredHeights[i] ?? fallbackParagraphHeight
    );

    const result: PageRange[] = [];
    let currentHeight = 0;
    let pageStart = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const height = heights[i];
      const gap = i > pageStart ? 16 : 0; // mb-4 = 16px gap between paragraphs

      // If adding this paragraph exceeds container, close current page
      if (currentHeight + gap + height > containerHeight && i > pageStart) {
        result.push({ startIndex: pageStart, endIndex: i });
        pageStart = i;
        currentHeight = height;
      } else {
        currentHeight += gap + height;
      }
    }

    // Close final page
    if (pageStart < paragraphs.length) {
      result.push({ startIndex: pageStart, endIndex: paragraphs.length });
    }

    return result;
  }, [paragraphs, measuredHeights, containerHeight, fallbackParagraphHeight]);

  const pageCount = pages.length;

  // Find which page contains the current paragraph
  const currentPageIndex = useMemo(() => {
    if (pages.length === 0) return 0;
    
    for (let i = 0; i < pages.length; i++) {
      if (currentParagraphIndex >= pages[i].startIndex && currentParagraphIndex < pages[i].endIndex) {
        return i;
      }
    }
    
    // Default to last page if beyond bounds
    return Math.max(0, pages.length - 1);
  }, [currentParagraphIndex, pages]);

  // Get paragraphs for current page
  const pageParagraphs = useMemo(() => {
    if (pages.length === 0) return [];
    const page = pages[currentPageIndex];
    if (!page) return [];
    return paragraphs.slice(page.startIndex, page.endIndex);
  }, [paragraphs, pages, currentPageIndex]);

  // Current paragraph's position on this page (0-based)
  const currentParagraphOnPage = useMemo(() => {
    if (pages.length === 0) return 0;
    const page = pages[currentPageIndex];
    if (!page) return 0;
    return Math.max(0, currentParagraphIndex - page.startIndex);
  }, [currentParagraphIndex, pages, currentPageIndex]);

  // Notify on paragraph changes
  useEffect(() => {
    if (currentParagraphIndex !== prevParagraphIndexRef.current) {
      prevParagraphIndexRef.current = currentParagraphIndex;
      onParagraphChange?.(currentParagraphIndex);
    }
  }, [currentParagraphIndex, onParagraphChange]);

  // Measure paragraph heights from DOM - with loop prevention
  const measureParagraphs = useCallback(() => {
    const refs = paragraphRefs.current;
    if (refs.length === 0) return;

    // We need to measure ALL paragraphs, but only refs for current page exist
    // So we'll build heights array: measured for current page, null for others
    const page = pages[currentPageIndex];
    
    const newHeights: (number | null)[] = [];
    for (let i = 0; i < paragraphs.length; i++) {
      if (page && i >= page.startIndex && i < page.endIndex) {
        const refIndex = i - page.startIndex;
        const el = refs[refIndex];
        if (el) {
          newHeights[i] = el.getBoundingClientRect().height;
        } else {
          newHeights[i] = measuredHeights[i] ?? null;
        }
      } else {
        // Keep previous measurement or null
        newHeights[i] = measuredHeights[i] ?? null;
      }
    }

    // Check if heights actually changed (with 2px tolerance)
    const hasChanged = 
      newHeights.length !== previousHeightsRef.current.length ||
      newHeights.some((h, i) => {
        const prev = previousHeightsRef.current[i];
        if (h === null && prev === null) return false;
        if (h === null || prev === null) return true;
        return Math.abs(h - prev) > 2;
      });

    if (!hasChanged) {
      if (import.meta.env.DEV) {
        console.log(`[DynamicPagination] Heights unchanged, skipping update`);
      }
      return;
    }

    previousHeightsRef.current = newHeights;
    setMeasuredHeights(newHeights);

    if (import.meta.env.DEV) {
      const measured = newHeights.filter(h => h !== null).length;
      console.log(`[DynamicPagination] Measured ${measured}/${paragraphs.length} paragraphs`);
    }
  }, [pages, currentPageIndex, paragraphs.length, measuredHeights]);

  // Navigation functions
  const goToNextPage = useCallback(() => {
    if (currentPageIndex < pageCount - 1) {
      const nextPage = pages[currentPageIndex + 1];
      if (nextPage) {
        setCurrentParagraphIndex(nextPage.startIndex);
      }
    }
  }, [currentPageIndex, pageCount, pages]);

  const goToPrevPage = useCallback(() => {
    if (currentPageIndex > 0) {
      const prevPage = pages[currentPageIndex - 1];
      if (prevPage) {
        setCurrentParagraphIndex(prevPage.startIndex);
      }
    }
  }, [currentPageIndex, pages]);

  const goToPage = useCallback((pageIndex: number) => {
    if (pageIndex >= 0 && pageIndex < pageCount) {
      const targetPage = pages[pageIndex];
      if (targetPage) {
        setCurrentParagraphIndex(targetPage.startIndex);
      }
    }
  }, [pageCount, pages]);

  const goToParagraph = useCallback((paragraphIndex: number) => {
    if (paragraphIndex >= 0 && paragraphIndex < paragraphs.length) {
      setCurrentParagraphIndex(paragraphIndex);
    }
  }, [paragraphs.length]);

  // Select a paragraph by its position on the current page
  const selectParagraph = useCallback((pageRelativeIndex: number) => {
    const page = pages[currentPageIndex];
    if (!page) return;
    
    const absoluteIndex = page.startIndex + pageRelativeIndex;
    if (absoluteIndex >= 0 && absoluteIndex < paragraphs.length) {
      setCurrentParagraphIndex(absoluteIndex);
    }
  }, [currentPageIndex, pages, paragraphs.length]);

  // Reset to initial paragraph when content changes (new chapter)
  useEffect(() => {
    setCurrentParagraphIndex(initialParagraphIndex);
    prevParagraphIndexRef.current = initialParagraphIndex;
    setMeasuredHeights([]); // Clear measurements for new content
  }, [content, initialParagraphIndex]);

  return {
    paragraphs,
    currentParagraphIndex,
    currentPageIndex,
    pageCount,
    pageParagraphs,
    currentParagraphOnPage,

    goToNextPage,
    goToPrevPage,
    goToPage,
    goToParagraph,
    selectParagraph,

    hasNextPage: currentPageIndex < pageCount - 1,
    hasPrevPage: currentPageIndex > 0,
    
    measureParagraphs,
    paragraphRefs,
  };
}
