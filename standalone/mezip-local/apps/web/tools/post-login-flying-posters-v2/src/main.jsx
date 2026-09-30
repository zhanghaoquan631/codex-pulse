import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import FlyingPosters from './FlyingPosters';
import './styles.css';

const posterItems = [
  {
    image: '/after-login-cards/card-1-cropped.jpg',
    alt: 'Oldport script — a warmly lit interior',
    quote: '“I am rooted, but I flow.”',
    author: 'Virginia Woolf',
  },
  {
    image: '/after-login-cards/card-2.jpg',
    alt: 'Ranch Water — a sunlit café table',
    quote: '“Life can only be understood backwards; but it must be lived forwards.”',
    author: 'Søren Kierkegaard',
  },
  {
    image: '/after-login-cards/card-3-cropped.jpg',
    alt: 'Burned pancakes — a quiet morning ritual',
    quote: '“Forever is composed of nows.”',
    author: 'Emily Dickinson',
  },
  {
    image: '/after-login-cards/card-4.jpg',
    alt: 'Coffee Club — a courtyard seen from above',
    quote: '“The true secret of happiness lies in taking a genuine interest in all the details of daily life.”',
    author: 'William Morris',
  },
];

function App() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const handleProgress = useCallback((index) => setCurrentIndex(index), []);
  const handleComplete = useCallback(() => setIsLeaving(true), []);

  useEffect(() => {
    if (!isLeaving) return undefined;
    const timer = window.setTimeout(() => {
      window.parent.postMessage({ type: 'mezip:flying-posters-complete', source: 'post-login-flying-posters-v2' }, window.location.origin);
    }, 520);
    return () => window.clearTimeout(timer);
  }, [isLeaving]);

  return (
    <main className={`flying-posters-demo${isLeaving ? ' is-leaving' : ''}`} aria-label="四张飞行介绍海报">
      <p className="scroll-label" aria-hidden="true">Scroll.</p>
      <FlyingPosters
        items={posterItems}
        planeWidth={320}
        planeHeight={500}
        distortion={3}
        scrollEase={0.01}
        cameraFov={45}
        cameraZ={20}
        finite
        onProgress={handleProgress}
        onComplete={handleComplete}
      />
      <p className="poster-counter" aria-live="polite">{String(currentIndex + 1).padStart(2, '0')} / 04</p>
      <p className="gesture-hint" aria-hidden="true">{currentIndex === 3 ? '继续滑动进入功能区' : 'Scroll · Drag'}</p>
      <ol className="sr-only">
        {posterItems.map((item) => (
          <li key={item.author}>
            <img src={item.image} alt={item.alt} />
            <blockquote>{item.quote}</blockquote>
            <cite>{item.author}</cite>
          </li>
        ))}
      </ol>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
