import { useNavigate } from 'react-router';
import { demoAnalysis, SAMPLE_ANSWERS } from '../../demo/engine.ts';
import { useSession } from '../../session/session.tsx';

/** "Ver un ejemplo": a demo run on sample answers, with no photos at all. */
export function useStartExample() {
  const { updateAnswers, setMode, setConsent, setAnalysis } = useSession();
  const navigate = useNavigate();
  return () => {
    updateAnswers(SAMPLE_ANSWERS);
    setMode('demo');
    setConsent(false);
    setAnalysis(demoAnalysis(SAMPLE_ANSWERS));
    navigate('/estudio/resultados');
  };
}
