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
  return (
    <main className="flying-posters-demo" aria-label="Four Nows flying poster gallery">
      <p className="scroll-label" aria-hidden="true">Scroll.</p>
      <FlyingPosters
        items={posterItems}
        planeWidth={352}
        planeHeight={550}
        distortion={3}
        scrollEase={0.01}
        cameraFov={45}
        cameraZ={20}
      />
      <p className="gesture-hint" aria-hidden="true">Scroll · Drag</p>
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
