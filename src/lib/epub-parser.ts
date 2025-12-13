import JSZip from 'jszip';

export interface EpubMetadata {
  title: string;
  author: string;
  coverBlob?: Blob;
}

export async function parseEpubMetadata(file: File): Promise<EpubMetadata> {
  const zip = await JSZip.loadAsync(file);
  
  // Find and parse container.xml to get the OPF file path
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) {
    throw new Error('Invalid EPUB: Missing container.xml');
  }
  
  // Extract rootfile path from container.xml
  const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!rootfileMatch) {
    throw new Error('Invalid EPUB: Cannot find content.opf path');
  }
  
  const opfPath = rootfileMatch[1];
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
  
  // Parse the OPF file
  const opfContent = await zip.file(opfPath)?.async('text');
  if (!opfContent) {
    throw new Error('Invalid EPUB: Cannot read content.opf');
  }
  
  // Extract title
  const titleMatch = opfContent.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled';
  
  // Extract author/creator
  const authorMatch = opfContent.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
  const author = authorMatch ? authorMatch[1].trim() : 'Unknown Author';
  
  // Try to find cover image
  let coverBlob: Blob | undefined;
  
  // Method 1: Look for cover in metadata
  const coverIdMatch = opfContent.match(/<meta[^>]*name="cover"[^>]*content="([^"]+)"/i) ||
                       opfContent.match(/<meta[^>]*content="([^"]+)"[^>]*name="cover"/i);
  
  if (coverIdMatch) {
    const coverId = coverIdMatch[1];
    const coverHrefMatch = opfContent.match(new RegExp(`<item[^>]*id="${coverId}"[^>]*href="([^"]+)"`, 'i')) ||
                           opfContent.match(new RegExp(`<item[^>]*href="([^"]+)"[^>]*id="${coverId}"`, 'i'));
    
    if (coverHrefMatch) {
      const coverPath = opfDir + coverHrefMatch[1];
      const coverFile = zip.file(coverPath);
      if (coverFile) {
        coverBlob = await coverFile.async('blob');
      }
    }
  }
  
  // Method 2: Look for cover.jpg or cover.png in common locations
  if (!coverBlob) {
    const coverPaths = [
      'cover.jpg', 'cover.jpeg', 'cover.png',
      'OEBPS/cover.jpg', 'OEBPS/cover.jpeg', 'OEBPS/cover.png',
      'OEBPS/images/cover.jpg', 'OEBPS/images/cover.jpeg', 'OEBPS/images/cover.png',
      'images/cover.jpg', 'images/cover.jpeg', 'images/cover.png',
    ];
    
    for (const path of coverPaths) {
      const coverFile = zip.file(path);
      if (coverFile) {
        coverBlob = await coverFile.async('blob');
        break;
      }
    }
  }
  
  // Method 3: Look for any image with "cover" in the name
  if (!coverBlob) {
    const files = Object.keys(zip.files);
    const coverFile = files.find(f => 
      /cover/i.test(f) && /\.(jpg|jpeg|png|gif)$/i.test(f)
    );
    if (coverFile) {
      coverBlob = await zip.file(coverFile)?.async('blob');
    }
  }
  
  return { title, author, coverBlob };
}

export function validateEpubFile(file: File): { valid: boolean; error?: string } {
  // Check file type
  if (!file.name.toLowerCase().endsWith('.epub')) {
    return { valid: false, error: 'Please select an EPUB file' };
  }
  
  // Check file size (10MB limit)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return { valid: false, error: 'File size must be less than 10MB' };
  }
  
  return { valid: true };
}
