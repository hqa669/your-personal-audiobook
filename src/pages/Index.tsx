import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, Headphones, BookOpen, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/Header';
import bookshelfHero from '@/assets/bookshelf-hero.jpg';
import readingPerson from '@/assets/reading-person.jpg';

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="container max-w-6xl mx-auto px-4 py-16 md:py-24">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              {/* Left content */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="space-y-6"
              >
                <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-foreground leading-tight">
                  Listen to any ebook for free
                </h1>
                <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-lg">
                  AI-powered audiobook experience for your own library. Transform your EPUBs into high-quality audio.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <Button variant="warm" size="xl" asChild>
                    <Link to="/library" className="gap-2">
                      <Play className="w-5 h-5" />
                      Try Free
                    </Link>
                  </Button>
                  <Button variant="outline" size="xl" asChild>
                    <Link to="/discover">Explore Classics</Link>
                  </Button>
                </div>
              </motion.div>

              {/* Right image */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="relative"
              >
                <div className="aspect-[4/3] rounded-3xl overflow-hidden shadow-card">
                  <img
                    src={bookshelfHero}
                    alt="Cozy bookshelf with warm lighting"
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* Floating badge */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.6 }}
                  className="absolute -bottom-4 -left-4 md:-left-8 glass-card px-4 py-3 flex items-center gap-3"
                >
                  <div className="bg-success/10 p-2 rounded-full">
                    <Headphones className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">AI Voice Ready</p>
                    <p className="text-xs text-muted-foreground">Natural narration</p>
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-16 md:py-24 bg-secondary/30">
          <div className="container max-w-6xl mx-auto px-4">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              {/* Left image */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="order-2 md:order-1"
              >
                <div className="aspect-square max-w-md mx-auto rounded-3xl overflow-hidden shadow-card">
                  <img
                    src={readingPerson}
                    alt="Person listening to audiobook"
                    className="w-full h-full object-cover"
                  />
                </div>
              </motion.div>

              {/* Right content */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="order-1 md:order-2 space-y-6"
              >
                <h2 className="font-serif text-3xl md:text-4xl text-foreground">
                  AI-powered exploration for free classic books
                </h2>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Discover thousands of public domain classics and let our AI transform them into beautiful audiobooks. Your personal reading companion, always ready.
                </p>
                <ul className="space-y-4">
                  {[
                    { icon: BookOpen, text: 'Upload your own EPUB files' },
                    { icon: Sparkles, text: 'AI-generated natural voices' },
                    { icon: Headphones, text: 'Listen anywhere, anytime' },
                  ].map((item, index) => (
                    <motion.li
                      key={index}
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: index * 0.1 }}
                      className="flex items-center gap-3"
                    >
                      <div className="bg-primary/10 p-2 rounded-full">
                        <item.icon className="w-5 h-5 text-primary" />
                      </div>
                      <span className="text-foreground">{item.text}</span>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 md:py-24">
          <div className="container max-w-3xl mx-auto px-4 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="space-y-6"
            >
              <h2 className="font-serif text-3xl md:text-4xl text-foreground">
                Your next listen is ready
              </h2>
              <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                Join thousands of readers who have discovered a new way to enjoy their favorite books.
              </p>
              <Button variant="warm" size="xl" asChild>
                <Link to="/auth">Get Started Free</Link>
              </Button>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container max-w-6xl mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © 2024 BookMine. Transform your reading experience.
          </p>
        </div>
      </footer>
    </div>
  );
}
