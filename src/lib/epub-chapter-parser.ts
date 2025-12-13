import JSZip from 'jszip';

export interface Chapter {
  id: string;
  title: string;
  content: string;
  index: number;
}

export interface ParsedBook {
  title: string;
  author: string;
  chapters: Chapter[];
}

/**
 * Downloads and parses an EPUB file to extract chapters
 */
export async function parseEpubChapters(epubUrl: string): Promise<ParsedBook> {
  // Fetch the EPUB file
  const response = await fetch(epubUrl);
  if (!response.ok) {
    throw new Error('Failed to download EPUB file');
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  // Find and parse container.xml to get the OPF file path
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) {
    throw new Error('Invalid EPUB: Missing container.xml');
  }
  
  const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!rootfileMatch) {
    throw new Error('Invalid EPUB: Cannot find rootfile');
  }
  
  const opfPath = rootfileMatch[1];
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
  
  // Parse OPF file
  const opfContent = await zip.file(opfPath)?.async('text');
  if (!opfContent) {
    throw new Error('Invalid EPUB: Missing OPF file');
  }
  
  const parser = new DOMParser();
  const opfDoc = parser.parseFromString(opfContent, 'application/xml');
  
  // Extract metadata
  const title = opfDoc.querySelector('metadata title')?.textContent || 
                opfDoc.querySelector('dc\\:title, title')?.textContent || 
                'Untitled';
  const author = opfDoc.querySelector('metadata creator')?.textContent || 
                 opfDoc.querySelector('dc\\:creator, creator')?.textContent || 
                 'Unknown Author';
  
  // Get spine items (reading order)
  const spineItems = Array.from(opfDoc.querySelectorAll('spine itemref'));
  const manifest = opfDoc.querySelector('manifest');
  
  const chapters: Chapter[] = [];
  
  for (let i = 0; i < spineItems.length; i++) {
    const idref = spineItems[i].getAttribute('idref');
    if (!idref) continue;
    
    const item = manifest?.querySelector(`item[id="${idref}"]`);
    if (!item) continue;
    
    const href = item.getAttribute('href');
    if (!href) continue;
    
    // Build full path
    const fullPath = opfDir + href;
    
    try {
      const content = await zip.file(fullPath)?.async('text');
      if (!content) continue;
      
      // Parse HTML content
      const htmlDoc = parser.parseFromString(content, 'text/html');
      
      // Extract title from chapter
      const chapterTitle = htmlDoc.querySelector('title')?.textContent ||
                          htmlDoc.querySelector('h1, h2, h3')?.textContent ||
                          `Chapter ${i + 1}`;
      
      // Extract text content, preserving paragraph structure
      const body = htmlDoc.body;
      if (!body) continue;
      
      // Get all text-containing elements
      const textContent = extractTextContent(body);
      
      if (textContent.trim()) {
        chapters.push({
          id: idref,
          title: chapterTitle.trim(),
          content: textContent,
          index: chapters.length,
        });
      }
    } catch (e) {
      console.warn(`Failed to parse chapter ${i}:`, e);
    }
  }
  
  if (chapters.length === 0) {
    throw new Error('No chapters found in EPUB');
  }
  
  return { title, author, chapters };
}

/**
 * Extracts text content from HTML body, preserving paragraph structure
 */
function extractTextContent(body: HTMLElement): string {
  const paragraphs: string[] = [];
  
  // Get all block-level elements
  const blocks = body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, blockquote');
  
  if (blocks.length === 0) {
    // Fallback: just get text content
    return body.textContent?.trim() || '';
  }
  
  blocks.forEach(block => {
    const text = block.textContent?.trim();
    if (text && text.length > 0) {
      paragraphs.push(text);
    }
  });
  
  return paragraphs.join('\n\n');
}
