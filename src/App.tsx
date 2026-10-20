import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { Landing } from './landing/Landing.tsx';
import { NotFound } from './pages/NotFound.tsx';
import { PrivacyPage } from './pages/PrivacyPage.tsx';
import { SessionProvider } from './session/session.tsx';
import { AnalysisStep } from './studio/AnalysisStep.tsx';
import { ConsentStep } from './studio/ConsentStep.tsx';
import { PhotosStep } from './studio/PhotosStep.tsx';
import { QuestionStep } from './studio/QuestionStep.tsx';
import { ComparePage } from './studio/results/ComparePage.tsx';
import { DetailPage } from './studio/results/DetailPage.tsx';
import { ResultsPage } from './studio/results/ResultsPage.tsx';
import { ReviewStep } from './studio/ReviewStep.tsx';
import { StudioLayout } from './studio/StudioLayout.tsx';

const FiguresPage = import.meta.env.DEV ? lazy(() => import('./screens/dev/FiguresPage.tsx')) : null;

const TITLES: [RegExp, string][] = [
  [/^\/estudio\/fotos/, 'Tus fotos'],
  [/^\/estudio\/consentimiento/, 'Consentimiento'],
  [/^\/estudio\/cuestionario/, 'Cuestionario'],
  [/^\/estudio\/revision/, 'Revisión'],
  [/^\/estudio\/analisis/, 'Análisis'],
  [/^\/estudio\/resultados\/.+/, 'Ficha del corte'],
  [/^\/estudio\/resultados/, 'Resultados'],
  [/^\/estudio\/comparar/, 'Comparar'],
  [/^\/privacidad/, 'Privacidad'],
];

function DocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const match = TITLES.find(([pattern]) => pattern.test(pathname));
    document.title = match ? `${match[1]} · FOLIA` : 'FOLIA · Tu estilista personal';
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <SessionProvider>
      <DocumentTitle />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/privacidad" element={<PrivacyPage />} />
          <Route path="/estudio" element={<StudioLayout />}>
            <Route index element={<Navigate to="fotos" replace />} />
            <Route path="fotos" element={<PhotosStep />} />
            <Route path="consentimiento" element={<ConsentStep />} />
            <Route path="cuestionario" element={<Navigate to="estilos" replace />} />
            <Route path="cuestionario/:slug" element={<QuestionStep />} />
            <Route path="revision" element={<ReviewStep />} />
            <Route path="analisis" element={<AnalysisStep />} />
            <Route path="resultados" element={<ResultsPage />} />
            <Route path="resultados/:styleId" element={<DetailPage />} />
            <Route path="comparar" element={<ComparePage />} />
          </Route>
          {FiguresPage ? <Route path="/dev/figuras" element={<FiguresPage />} /> : null}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </SessionProvider>
  );
}
