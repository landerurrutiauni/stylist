import { useSession } from '../session/session.tsx';
import { QUESTIONS, type Field } from './questions.ts';
import type { DraftAnswers } from '../../shared/schema/answers.ts';

function summary(field: Field, answers: DraftAnswers): string | null {
  const value = answers[field.key];
  if (field.kind === 'text') return null;
  if (field.kind === 'single') return field.options.find((option) => option.value === value)?.label ?? null;
  const labels = (value as string[]).map((item) => field.options.find((option) => option.value === item)?.label).filter(Boolean);
  return labels.length ? labels.join(', ') : null;
}

/**
 * "Tu ficha": the salon card filling in as the questionnaire is answered, with
 * the two photos at the top. Shown beside the questions on wide screens.
 */
export function DraftTicket({ current }: { current?: string }) {
  const { state } = useSession();
  const { frontal, profile } = state.photos;
  return (
    <aside className="draft-ticket" aria-label="Tu ficha hasta ahora">
      <p className="draft-title">Tu ficha</p>
      {frontal && profile ? (
        <div className="draft-photos">
          <img src={frontal.url} alt="" width={frontal.width} height={frontal.height} />
          <img src={profile.url} alt="" width={profile.width} height={profile.height} />
        </div>
      ) : null}
      <dl>
        {QUESTIONS.map((question) => {
          const text = summary(question.fields[0]!, state.answers);
          return (
            <div key={question.slug} className={question.slug === current ? 'is-current' : undefined}>
              <dt>{question.short}</dt>
              <dd>{text ?? '—'}</dd>
            </div>
          );
        })}
      </dl>
    </aside>
  );
}
