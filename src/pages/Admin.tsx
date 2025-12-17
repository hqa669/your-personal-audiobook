import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin, PublicBook, PublicBookChapter, NewPublicBook } from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { parseEpubChapters, Chapter as EpubChapter } from '@/lib/epub-chapter-parser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ArrowLeft, Plus, Pencil, Trash2, Upload, Book, Music, Loader2, FolderOpen, CheckCircle2 } from 'lucide-react';
import { Header } from '@/components/Header';
import { toast } from 'sonner';

const GENRES = ['Fiction', 'Non-Fiction', 'Science Fiction', 'Fantasy', 'Mystery', 'Romance', 'Biography', 'History', 'Philosophy', 'Poetry', 'Classic'];

interface ChapterWithFiles {
  index: number;
  title: string;
  audioFile: File | null;
  syncFile: File | null;
  existingAudioUrl?: string;
  existingSyncUrl?: string;
  existingId?: string;
  uploadStatus?: 'pending' | 'uploading' | 'finished' | 'error';
}

export default function Admin() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { 
    isAdmin, 
    isLoading, 
    books, 
    chapters,
    fetchPublicBooks, 
    fetchChapters,
    addPublicBook, 
    updatePublicBook, 
    deletePublicBook,
    addChapter,
    deleteChapter,
    uploadFile,
  } = useAdmin();

  const [selectedBook, setSelectedBook] = useState<PublicBook | null>(null);
  const [isBookDialogOpen, setIsBookDialogOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<PublicBook | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  
  // EPUB-based chapters
  const [epubChapters, setEpubChapters] = useState<ChapterWithFiles[]>([]);
  const [isParsingEpub, setIsParsingEpub] = useState(false);

  // Book form state
  const [bookForm, setBookForm] = useState<NewPublicBook>({
    title: '',
    author: '',
    genre: '',
    description: '',
    cover_url: '',
    epub_url: '',
    slug: '',
    is_featured: false,
  });

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      fetchPublicBooks();
    }
  }, [isAdmin]);

  // Sync selectedBook with actual books list (clear if book was deleted)
  useEffect(() => {
    if (selectedBook && books.length > 0) {
      const bookStillExists = books.find(b => b.id === selectedBook.id);
      if (!bookStillExists) {
        setSelectedBook(null);
        setEpubChapters([]);
      }
    }
  }, [books, selectedBook]);

  // Parse EPUB when book is selected
  useEffect(() => {
    if (selectedBook) {
      fetchChapters(selectedBook.id);
      parseBookEpub(selectedBook);
    } else {
      setEpubChapters([]);
    }
  }, [selectedBook]);

  // Merge existing chapters with parsed EPUB chapters
  useEffect(() => {
    if (epubChapters.length > 0 && chapters.length > 0) {
      setEpubChapters(prev => prev.map(ch => {
        const existing = chapters.find(c => c.chapter_index === ch.index);
        if (existing) {
          return {
            ...ch,
            existingAudioUrl: existing.audio_url,
            existingSyncUrl: existing.sync_url || undefined,
            existingId: existing.id,
          };
        }
        return ch;
      }));
    }
  }, [chapters]);

  const parseBookEpub = async (book: PublicBook) => {
    setIsParsingEpub(true);
    try {
      const parsed = await parseEpubChapters(book.epub_url);
      const chapterList: ChapterWithFiles[] = parsed.chapters.map((ch, idx) => ({
        index: idx + 1, // 1-based index for folder matching
        title: ch.title,
        audioFile: null,
        syncFile: null,
      }));
      setEpubChapters(chapterList);
    } catch (err) {
      console.error('Failed to parse EPUB:', err);
      toast.error('Failed to parse EPUB file');
      setEpubChapters([]);
    } finally {
      setIsParsingEpub(false);
    }
  };

  // Loading state
  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-16 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // Not admin
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-serif text-foreground mb-4">Access Denied</h1>
          <p className="text-muted-foreground mb-8">You don't have permission to access this page.</p>
          <Button onClick={() => navigate('/library')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Library
          </Button>
        </div>
      </div>
    );
  }

  const handleAddBook = async () => {
    setIsSubmitting(true);
    const id = await addPublicBook(bookForm);
    setIsSubmitting(false);
    if (id) {
      setIsBookDialogOpen(false);
      resetBookForm();
    }
  };

  const handleUpdateBook = async () => {
    if (!editingBook) return;
    setIsSubmitting(true);
    const success = await updatePublicBook(editingBook.id, bookForm);
    setIsSubmitting(false);
    if (success) {
      setIsBookDialogOpen(false);
      setEditingBook(null);
      resetBookForm();
    }
  };

  const handleDeleteBook = async (id: string) => {
    // First delete all chapters associated with the book
    const bookChapters = chapters.filter(ch => ch.book_id === id);
    for (const ch of bookChapters) {
      await deleteChapter(ch.id, id);
    }
    // Then delete the book
    await deletePublicBook(id);
    if (selectedBook?.id === id) {
      setSelectedBook(null);
      setEpubChapters([]);
    }
  };

  const resetBookForm = () => {
    setBookForm({
      title: '',
      author: '',
      genre: '',
      description: '',
      cover_url: '',
      epub_url: '',
      slug: '',
      is_featured: false,
    });
  };

  const openEditBook = (book: PublicBook) => {
    setEditingBook(book);
    setBookForm({
      title: book.title,
      author: book.author || '',
      genre: book.genre || '',
      description: book.description || '',
      cover_url: book.cover_url || '',
      epub_url: book.epub_url,
      slug: book.slug || '',
      is_featured: book.is_featured || false,
    });
    setIsBookDialogOpen(true);
  };

  const handleBookFileUpload = async (file: File, type: 'epub' | 'cover') => {
    const slug = bookForm.slug || bookForm.title.toLowerCase().replace(/\s+/g, '-');
    let path = '';
    
    if (type === 'epub') {
      path = `books/${slug}/book.epub`;
    } else {
      path = `books/${slug}/cover.jpg`;
    }

    const url = await uploadFile(file, path);
    if (url) {
      if (type === 'epub') {
        setBookForm(prev => ({ ...prev, epub_url: url }));
      } else {
        setBookForm(prev => ({ ...prev, cover_url: url }));
      }
    }
  };

  // Handle folder selection via webkitdirectory input
  const handleFolderSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const updatedChapters = [...epubChapters];
    
    // Process all files from the folder selection
    Array.from(files).forEach(file => {
      // File path looks like: "chapters/95/audio.mp3" or "95/audio.mp3"
      const pathParts = file.webkitRelativePath.split('/');
      
      // Find the chapter folder number in the path
      for (let i = 0; i < pathParts.length - 1; i++) {
        const folderName = pathParts[i];
        const chapterNum = parseInt(folderName, 10);
        
        if (!isNaN(chapterNum)) {
          const chapterIndex = updatedChapters.findIndex(ch => ch.index === chapterNum);
          if (chapterIndex !== -1) {
            const fileName = file.name.toLowerCase();
            
            if (fileName === 'audio.mp3') {
              updatedChapters[chapterIndex] = {
                ...updatedChapters[chapterIndex],
                audioFile: file,
              };
            } else if (fileName === 'sync.json') {
              updatedChapters[chapterIndex] = {
                ...updatedChapters[chapterIndex],
                syncFile: file,
              };
            }
          }
          break;
        }
      }
    });
    
    setEpubChapters(updatedChapters);
    
    const foundAudio = updatedChapters.filter(ch => ch.audioFile).length;
    const foundSync = updatedChapters.filter(ch => ch.syncFile).length;
    toast.success(`Found ${foundAudio} audio files and ${foundSync} sync files`);
    
    // Reset the input so the same folder can be selected again
    event.target.value = '';
  };

  // Upload all chapters with files
  const handleUploadAll = async () => {
    if (!selectedBook) return;
    
    const chaptersToUpload = epubChapters.filter(ch => ch.audioFile || ch.syncFile);
    if (chaptersToUpload.length === 0) {
      toast.error('No files to upload. Select a folder first.');
      return;
    }
    
    setIsUploading(true);
    setUploadProgress({ current: 0, total: chaptersToUpload.length });
    let successCount = 0;
    let errorCount = 0;
    
    const slug = selectedBook.slug || selectedBook.title.toLowerCase().replace(/\s+/g, '-');
    
    // Mark all chapters to upload as pending
    setEpubChapters(prev => prev.map(ch => 
      (ch.audioFile || ch.syncFile) ? { ...ch, uploadStatus: 'pending' as const } : ch
    ));
    
    for (let i = 0; i < chaptersToUpload.length; i++) {
      const chapter = chaptersToUpload[i];
      
      // Mark current chapter as uploading
      setEpubChapters(prev => prev.map(ch => 
        ch.index === chapter.index ? { ...ch, uploadStatus: 'uploading' as const } : ch
      ));
      
      try {
        let audioUrl = chapter.existingAudioUrl || '';
        let syncUrl = chapter.existingSyncUrl || '';
        
        // Upload audio file if present
        if (chapter.audioFile) {
          const audioPath = `books/${slug}/chapters/${String(chapter.index).padStart(3, '0')}.mp3`;
          const url = await uploadFile(chapter.audioFile, audioPath);
          if (url) audioUrl = url;
        }
        
        // Upload sync file if present
        if (chapter.syncFile) {
          const syncPath = `books/${slug}/chapters/${String(chapter.index).padStart(3, '0')}.sync.json`;
          const url = await uploadFile(chapter.syncFile, syncPath);
          if (url) syncUrl = url;
        }
        
        // If chapter exists, delete it first (we'll recreate)
        if (chapter.existingId) {
          await deleteChapter(chapter.existingId, selectedBook.id);
        }
        
        // Add/update chapter record
        if (audioUrl) {
          await addChapter({
            book_id: selectedBook.id,
            chapter_index: chapter.index,
            title: chapter.title,
            audio_url: audioUrl,
            sync_url: syncUrl || undefined,
          });
          successCount++;
          
          // Mark chapter as finished
          setEpubChapters(prev => prev.map(ch => 
            ch.index === chapter.index ? { ...ch, uploadStatus: 'finished' as const } : ch
          ));
        }
      } catch (err) {
        console.error(`Failed to upload chapter ${chapter.index}:`, err);
        errorCount++;
        
        // Mark chapter as error
        setEpubChapters(prev => prev.map(ch => 
          ch.index === chapter.index ? { ...ch, uploadStatus: 'error' as const } : ch
        ));
      }
      
      setUploadProgress({ current: i + 1, total: chaptersToUpload.length });
    }
    
    setIsUploading(false);
    
    if (errorCount === 0) {
      toast.success(`Successfully uploaded ${successCount} chapters`);
    } else {
      toast.warning(`Uploaded ${successCount} chapters, ${errorCount} failed`);
    }
    
    // Refresh chapters list
    await fetchChapters(selectedBook.id);
  };

  const hasFilesToUpload = epubChapters.some(ch => ch.audioFile || ch.syncFile);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-serif text-foreground">Public Library Admin</h1>
            <p className="text-muted-foreground mt-1">Manage public domain books and audio chapters</p>
          </div>
          <Button onClick={() => navigate('/library')} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Library
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Books List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Book className="h-5 w-5" />
                  Books ({books.length})
                </CardTitle>
                <Dialog open={isBookDialogOpen} onOpenChange={(open) => {
                  setIsBookDialogOpen(open);
                  if (!open) {
                    setEditingBook(null);
                    resetBookForm();
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{editingBook ? 'Edit Book' : 'Add New Book'}</DialogTitle>
                      <DialogDescription>
                        {editingBook ? 'Update the book details below.' : 'Enter the details for the new public book.'}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="title">Title *</Label>
                          <Input
                            id="title"
                            value={bookForm.title}
                            onChange={(e) => setBookForm(prev => ({ ...prev, title: e.target.value }))}
                            placeholder="Pride and Prejudice"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="author">Author</Label>
                          <Input
                            id="author"
                            value={bookForm.author}
                            onChange={(e) => setBookForm(prev => ({ ...prev, author: e.target.value }))}
                            placeholder="Jane Austen"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="genre">Genre</Label>
                          <Select
                            value={bookForm.genre}
                            onValueChange={(value) => setBookForm(prev => ({ ...prev, genre: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select genre" />
                            </SelectTrigger>
                            <SelectContent>
                              {GENRES.map(genre => (
                                <SelectItem key={genre} value={genre}>{genre}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="slug">Slug</Label>
                          <Input
                            id="slug"
                            value={bookForm.slug}
                            onChange={(e) => setBookForm(prev => ({ ...prev, slug: e.target.value }))}
                            placeholder="pride-and-prejudice"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          value={bookForm.description}
                          onChange={(e) => setBookForm(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="A brief description of the book..."
                          rows={3}
                        />
                      </div>
                      <Separator />
                      <div className="space-y-2">
                        <Label>EPUB File *</Label>
                        <div className="flex gap-2">
                          <Input
                            value={bookForm.epub_url}
                            onChange={(e) => setBookForm(prev => ({ ...prev, epub_url: e.target.value }))}
                            placeholder="https://storage.url/book.epub"
                            className="flex-1"
                          />
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              accept=".epub"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleBookFileUpload(file, 'epub');
                              }}
                            />
                            <Button type="button" variant="outline" asChild>
                              <span><Upload className="h-4 w-4" /></span>
                            </Button>
                          </label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Cover Image</Label>
                        <div className="flex gap-2">
                          <Input
                            value={bookForm.cover_url}
                            onChange={(e) => setBookForm(prev => ({ ...prev, cover_url: e.target.value }))}
                            placeholder="https://storage.url/cover.jpg"
                            className="flex-1"
                          />
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleBookFileUpload(file, 'cover');
                              }}
                            />
                            <Button type="button" variant="outline" asChild>
                              <span><Upload className="h-4 w-4" /></span>
                            </Button>
                          </label>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="featured"
                          checked={bookForm.is_featured || false}
                          onCheckedChange={(checked) => setBookForm(prev => ({ ...prev, is_featured: checked }))}
                        />
                        <Label htmlFor="featured">Featured book</Label>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button 
                        onClick={editingBook ? handleUpdateBook : handleAddBook}
                        disabled={!bookForm.title || !bookForm.epub_url || isSubmitting}
                      >
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {editingBook ? 'Update Book' : 'Add Book'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
              {books.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">No books yet. Add your first book above.</p>
              ) : (
                books.map(book => (
                  <div
                    key={book.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedBook?.id === book.id
                        ? 'bg-primary/10 border-primary'
                        : 'bg-card hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedBook(book)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-foreground truncate">{book.title}</h3>
                        <p className="text-sm text-muted-foreground truncate">{book.author || 'Unknown'}</p>
                        <div className="flex gap-1 mt-1">
                          {book.genre && <Badge variant="secondary" className="text-xs">{book.genre}</Badge>}
                          {book.is_featured && <Badge className="text-xs">Featured</Badge>}
                        </div>
                      </div>
                      <div className="flex gap-1 ml-2">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEditBook(book); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={(e) => e.stopPropagation()}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete "{book.title}"?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete this book and all its chapters. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteBook(book.id)} className="bg-destructive text-destructive-foreground">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Chapters Panel */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Music className="h-5 w-5" />
                    {selectedBook ? `Chapters: ${selectedBook.title}` : 'Chapters'}
                  </CardTitle>
                  <CardDescription>
                    {selectedBook 
                      ? isParsingEpub 
                        ? 'Parsing EPUB...' 
                        : `${epubChapters.length} chapter(s) from EPUB`
                      : 'Select a book to manage chapters'
                    }
                  </CardDescription>
                </div>
                {selectedBook && !isParsingEpub && (
                  <div className="flex gap-2">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        // @ts-ignore - webkitdirectory is non-standard
                        webkitdirectory=""
                        multiple
                        className="hidden"
                        onChange={handleFolderSelect}
                        disabled={epubChapters.length === 0}
                      />
                      <Button 
                        variant="outline" 
                        size="sm" 
                        asChild
                        disabled={epubChapters.length === 0}
                      >
                        <span>
                          <FolderOpen className="h-4 w-4 mr-1" />
                          Select Folder
                        </span>
                      </Button>
                    </label>
                    <Button 
                      size="sm" 
                      onClick={handleUploadAll}
                      disabled={!hasFilesToUpload || isUploading}
                    >
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-1" />
                      )}
                      Upload All
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Upload Progress Bar */}
              {isUploading && (
                <div className="mb-4 space-y-2">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Uploading chapters...</span>
                    <span>{uploadProgress.current} / {uploadProgress.total}</span>
                  </div>
                  <Progress value={(uploadProgress.current / uploadProgress.total) * 100} className="h-2" />
                </div>
              )}
              
              {!selectedBook ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Book className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select a book from the list to manage its chapters</p>
                </div>
              ) : isParsingEpub ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                  <p>Parsing EPUB file...</p>
                </div>
              ) : epubChapters.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Music className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No chapters found in EPUB file.</p>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">#</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead className="w-32">Audio</TableHead>
                        <TableHead className="w-32">Sync</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {epubChapters.map(chapter => {
                        const renderBadge = (hasFile: File | null, existingUrl?: string) => {
                          if (chapter.uploadStatus === 'finished') {
                            return <Badge variant="default">✓ Finish</Badge>;
                          }
                          if (chapter.uploadStatus === 'uploading') {
                            return (
                              <Badge variant="outline" className="animate-pulse">
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Uploading
                              </Badge>
                            );
                          }
                          if (chapter.uploadStatus === 'error') {
                            return <Badge variant="destructive">Error</Badge>;
                          }
                          if (hasFile) {
                            return (
                              <Badge className="bg-audio-ready text-white">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Ready
                              </Badge>
                            );
                          }
                          if (existingUrl) {
                            return <Badge variant="default">✓ Uploaded</Badge>;
                          }
                          return <Badge variant="secondary">—</Badge>;
                        };
                        
                        return (
                          <TableRow key={chapter.index}>
                            <TableCell className="font-mono">{chapter.index}</TableCell>
                            <TableCell className="font-medium">{chapter.title}</TableCell>
                            <TableCell>
                              {renderBadge(chapter.audioFile, chapter.existingAudioUrl)}
                            </TableCell>
                            <TableCell>
                              {renderBadge(chapter.syncFile, chapter.existingSyncUrl)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
