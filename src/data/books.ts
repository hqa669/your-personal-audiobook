export interface Book {
  id: string;
  title: string;
  author: string;
  description: string;
  coverColor: string;
  genre: string;
  status?: 'ready' | 'processing' | 'new';
  progress?: number;
}

export const freeBooks: Book[] = [
  {
    id: '1',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    description: 'A romantic novel following Elizabeth Bennet as she navigates love, reputation, and class in Regency-era England.',
    coverColor: 'bg-gradient-to-br from-rose-100 to-rose-200',
    genre: 'Romance',
  },
  {
    id: '2',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    description: 'A tale of wealth, love, and tragedy set against the backdrop of the Roaring Twenties in America.',
    coverColor: 'bg-gradient-to-br from-amber-100 to-yellow-200',
    genre: 'Classic',
  },
  {
    id: '3',
    title: '1984',
    author: 'George Orwell',
    description: 'A dystopian masterpiece exploring surveillance, truth, and totalitarianism in a dark future world.',
    coverColor: 'bg-gradient-to-br from-slate-200 to-slate-300',
    genre: 'Dystopian',
  },
  {
    id: '4',
    title: 'Jane Eyre',
    author: 'Charlotte Brontë',
    description: 'A groundbreaking novel about an orphan who becomes a governess and finds love at Thornfield Hall.',
    coverColor: 'bg-gradient-to-br from-purple-100 to-purple-200',
    genre: 'Romance',
  },
  {
    id: '5',
    title: 'Moby Dick',
    author: 'Herman Melville',
    description: 'The epic tale of Captain Ahab\'s obsessive quest to hunt the great white whale.',
    coverColor: 'bg-gradient-to-br from-blue-100 to-cyan-200',
    genre: 'Adventure',
  },
  {
    id: '6',
    title: 'Frankenstein',
    author: 'Mary Shelley',
    description: 'A Gothic tale of ambition, creation, and the consequences of playing God.',
    coverColor: 'bg-gradient-to-br from-green-100 to-emerald-200',
    genre: 'Gothic',
  },
  {
    id: '7',
    title: 'Dracula',
    author: 'Bram Stoker',
    description: 'The definitive vampire novel following Count Dracula\'s attempt to move to England.',
    coverColor: 'bg-gradient-to-br from-red-100 to-red-200',
    genre: 'Gothic',
  },
  {
    id: '8',
    title: 'The Picture of Dorian Gray',
    author: 'Oscar Wilde',
    description: 'A philosophical novel about beauty, corruption, and the price of eternal youth.',
    coverColor: 'bg-gradient-to-br from-violet-100 to-violet-200',
    genre: 'Classic',
  },
];

export const userLibrary: Book[] = [
  {
    id: 'u1',
    title: 'The Midnight Library',
    author: 'Matt Haig',
    description: 'A novel about all the choices that go into a life well lived.',
    coverColor: 'bg-gradient-to-br from-indigo-200 to-indigo-300',
    genre: 'Fiction',
    status: 'ready',
    progress: 45,
  },
  {
    id: 'u2',
    title: 'Atomic Habits',
    author: 'James Clear',
    description: 'An easy and proven way to build good habits and break bad ones.',
    coverColor: 'bg-gradient-to-br from-orange-100 to-orange-200',
    genre: 'Self-Help',
    status: 'processing',
    progress: 0,
  },
];

export const genres = ['All', 'Romance', 'Classic', 'Dystopian', 'Adventure', 'Gothic', 'Fiction', 'Self-Help'];

export const sampleChapterText = `
~Chapter One~

It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.

However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.

"My dear Mr. Bennet," said his lady to him one day, "have you heard that Netherfield Park is let at last?"

Mr. Bennet replied that he had not.

"But it is," returned she; "for Mrs. Long has just been here, and she told me all about it."

Mr. Bennet made no answer.

"Do you not want to know who has taken it?" cried his wife impatiently.

"You want to tell me, and I have no objection to hearing it."

This was invitation enough.

"Why, my dear, you must know, Mrs. Long says that Netherfield is taken by a young man of large fortune from the north of England; that he came down on Monday in a chaise and four to see the place, and was so much delighted with it, that he agreed with Mr. Morris immediately; that he is to take possession before Michaelmas, and some of his servants are to be in the house by the end of next week."

"What is his name?"

"Bingley."

"Is he married or single?"

"Oh! Single, my dear, to be sure! A single man of large fortune; four or five thousand a year. What a fine thing for our girls!"
`;
