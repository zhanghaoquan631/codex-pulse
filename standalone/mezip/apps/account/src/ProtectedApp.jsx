import React, { useEffect } from 'react';
import OfficialLanyard from './components/OfficialLanyard/OfficialLanyard.jsx';
import LanyardProfileFaces from './components/LanyardProfileFaces/LanyardProfileFaces.jsx';
import SelfieCardFaces from './components/SelfieCardFaces/SelfieCardFaces.jsx';
import ImageLanyardFaces from './components/ImageLanyardFaces/ImageLanyardFaces.jsx';
import TripleBackdrop, { TripleColorFilters } from './components/TripleBackdrop/TripleBackdrop.jsx';
import TopBadgeDeck from './components/TopBadgeDeck/TopBadgeDeck.jsx';
import PixelTransitionLaunch from './components/PixelTransitionLaunch/PixelTransitionLaunch.jsx';
import WorkspaceEntrances from './components/WorkspaceEntrances/WorkspaceEntrances.jsx';

const asset = name => `${import.meta.env.BASE_URL}assets/${name}`;

function ProtectedApp({ signOutPath, user }) {
  useEffect(() => {
    document.documentElement.dataset.protectedSurface = 'true';
    return () => {
      delete document.documentElement.dataset.protectedSurface;
    };
  }, []);

  return (
    <main className="triple-profile-page" data-protected-content="true" data-authorized-user={user?.email || 'authorized-user'}>
      <h1 className="sr-only">弓弦影 · Alex · FDE产品经理 · 三段背景吊牌</h1>
      <a className="session-exit" href={signOutPath} target="_top" aria-label="退出登录" style={{ textDecoration: 'none' }}>退出登录</a>
      <TripleBackdrop />
      <TopBadgeDeck />
      <section className="triple-lanyard-stage" aria-label="三段背景上的可摆动吊牌">
        <OfficialLanyard
          position={[0, 0, 24]}
          cornerDragOnly
          htmlDistanceFactor={1.25}
          cardRotation={[0, 0, 0]}
          cards={[
            {
              id: 'intro-5198',
              // Left: the first URL, the green intro/profile card.
              worldOffset: [-5.2, 0, 0],
              // Narrow windows still show all three tags at once. The wide
              // offsets remain unchanged on desktop, while this compact
              // resting position keeps the left tag inside its third.
              compactWorldOffset: [-2, 0, 0],
              cardContent: ({ dragApi, faceSide, isDragging }) => (
                <LanyardProfileFaces
                  asset={asset}
                  dragApi={dragApi}
                  faceSide={faceSide}
                  isDragging={isDragging}
                />
              )
            },
            {
              id: 'selfie-5179',
              // Middle: the second URL, the blue selfie card.
              worldOffset: [0, 0, 0],
              compactWorldOffset: [0, 0, 0],
              cardContent: ({ dragApi, faceSide, isDragging }) => (
                <SelfieCardFaces
                  asset={asset}
                  dragApi={dragApi}
                  faceSide={faceSide}
                  isDragging={isDragging}
                />
              )
            },
            {
              id: 'image-5186',
              // Right: the third URL, the orange Portfolio/ME.zip image card.
              worldOffset: [5.2, 0, 0],
              compactWorldOffset: [2, 0, 0],
              cardContent: ({ dragApi, faceSide, isDragging }) => (
                <ImageLanyardFaces
                  asset={asset}
                  dragApi={dragApi}
                  faceSide={faceSide}
                  isDragging={isDragging}
                />
              )
            }
          ]}
        />
      </section>
      <TripleColorFilters />
      <PixelTransitionLaunch asset={asset} />
      <WorkspaceEntrances />
    </main>
  );
}

export default ProtectedApp;
