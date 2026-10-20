import { useId } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import type { DraftAnswers } from '../../shared/schema/answers.ts';
import { useSession } from '../session/session.tsx';
import { ScreenTitle } from '../ui/ScreenTitle.tsx';
import { DraftTicket } from './DraftTicket.tsx';
import { QUESTIONS, questionIndex, type Field } from './questions.ts';

function SingleField({ field }: { field: Extract<Field, { kind: 'single' }> }) {
  const { state, updateAnswers } = useSession();
  const name = useId();
  const value = state.answers[field.key] as string | null;
  return (
    <fieldset className="field">
      <legend>{field.legend}</legend>
      <div className="options">
        {field.options.map((option) => (
          <label key={option.value} className="option">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => updateAnswers({ [field.key]: option.value } as Partial<DraftAnswers>)}
            />
            <span className="option-body">
              <span className="option-label">{option.label}</span>
              {option.hint ? <span className="option-hint">{option.hint}</span> : null}
            </span>
          </label>
        ))}
      </div>
      {field.optional && value ? (
        <button type="button" className="btn-text clear-choice" onClick={() => updateAnswers({ [field.key]: null } as Partial<DraftAnswers>)}>
          Quitar la elección
        </button>
      ) : null}
    </fieldset>
  );
}

function MultiField({ field }: { field: Extract<Field, { kind: 'multi' }> }) {
  const { state, updateAnswers } = useSession();
  const values = state.answers[field.key] as string[];
  const toggle = (option: string) => {
    let next = values.includes(option) ? values.filter((item) => item !== option) : [...values, option];
    if (field.exclusive) {
      next =
        option === field.exclusive && next.includes(option)
          ? [option]
          : next.filter((item) => item !== field.exclusive || option === field.exclusive);
    }
    updateAnswers({ [field.key]: next } as Partial<DraftAnswers>);
  };
  return (
    <fieldset className="field">
      <legend>{field.legend}</legend>
      <div className="options options-chips">
        {field.options.map((option) => (
          <label key={option.value} className="option option-chip">
            <input type="checkbox" value={option.value} checked={values.includes(option.value)} onChange={() => toggle(option.value)} />
            <span className="option-body">
              <span className="option-label">{option.label}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function TextField({ field }: { field: Extract<Field, { kind: 'text' }> }) {
  const { state, updateAnswers } = useSession();
  const id = useId();
  const value = state.answers[field.key] as string;
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {field.label}
      </label>
      <p id={`${id}-hint`} className="field-hint">
        {field.hint}
      </p>
      <textarea
        id={id}
        name={field.key}
        rows={3}
        maxLength={field.max}
        value={value}
        placeholder={field.placeholder}
        autoComplete="off"
        aria-describedby={`${id}-hint ${id}-count`}
        onChange={(event) => updateAnswers({ [field.key]: event.target.value } as Partial<DraftAnswers>)}
      />
      <p id={`${id}-count`} className="field-count num">
        {value.length} de {field.max} caracteres
      </p>
    </div>
  );
}

export function QuestionStep() {
  const { slug = '' } = useParams();
  const { state } = useSession();
  const navigate = useNavigate();
  const index = questionIndex(slug);
  const reasonId = useId();

  const canAnswer = state.mode === 'demo' || (state.photos.frontal && state.photos.profile && state.consent);
  if (!canAnswer) return <Navigate to={state.photos.frontal && state.photos.profile ? '/estudio/consentimiento' : '/estudio/fotos'} replace />;
  if (index < 0) return <Navigate to="/estudio/cuestionario/estilos" replace />;

  const question = QUESTIONS[index]!;
  const first = question.fields[0]!;
  const answered = first.kind !== 'single' || state.answers[first.key] !== null;
  const last = index === QUESTIONS.length - 1;
  const next = last ? '/estudio/revision' : `/estudio/cuestionario/${QUESTIONS[index + 1]!.slug}`;
  const previous =
    index === 0
      ? state.mode === 'demo' && !state.photos.frontal
        ? '/'
        : '/estudio/consentimiento'
      : `/estudio/cuestionario/${QUESTIONS[index - 1]!.slug}`;
  const progress = (index + 1) / QUESTIONS.length;

  return (
    <div className="screen screen-question">
      <div className="question-layout">
        <div>
          <div className="progress">
            <p className="progress-count num">
              Pregunta {index + 1} de {QUESTIONS.length}
              {question.required ? '' : ' · se puede omitir'}
            </p>
            <div
              className="progress-track"
              role="progressbar"
              aria-label="Progreso del cuestionario"
              aria-valuemin={1}
              aria-valuemax={QUESTIONS.length}
              aria-valuenow={index + 1}
            >
              <div className="progress-fill" style={{ transform: `scaleX(${progress})` }} />
            </div>
          </div>

          <form
            className="question"
            onSubmit={(event) => {
              event.preventDefault();
              if (answered || !question.required) navigate(next);
            }}
          >
            <header className="screen-head">
              <ScreenTitle>{question.title}</ScreenTitle>
              <p className="screen-lede">{question.help}</p>
            </header>

            {question.fields.map((field) =>
              field.kind === 'single' ? (
                <SingleField key={field.key} field={field} />
              ) : field.kind === 'multi' ? (
                <MultiField key={field.key} field={field} />
              ) : (
                <TextField key={field.key} field={field} />
              ),
            )}

            <div className="question-nav">
              <Link to={previous} className="btn btn-outline">
                Atrás
              </Link>
              <div className="question-next">
                {!question.required ? (
                  <Link to={next} className="btn btn-text">
                    Omitir
                  </Link>
                ) : null}
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={question.required && !answered}
                  aria-describedby={question.required && !answered ? reasonId : undefined}
                >
                  {last ? 'Revisar respuestas' : 'Siguiente'}
                </button>
              </div>
            </div>
            {question.required && !answered ? (
              <p id={reasonId} className="action-reason question-reason">
                Elige una opción para seguir.
              </p>
            ) : null}
          </form>
        </div>
        <DraftTicket current={question.slug} />
      </div>
    </div>
  );
}
