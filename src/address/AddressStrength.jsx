import { strengthLabel } from './addressValidation';

/**
 * Component-coverage meter. Replaces the "<20 characters" blocking rule:
 * it tells the customer what is missing instead of punishing short input.
 *
 * `blocked` wins over the score. Coverage alone can read 3/5 while a
 * mandatory field is still empty (apartment name + locality + area, no house
 * number) — showing "Okay" there would contradict the red field below it.
 */
export default function AddressStrength({ score, total = 5, blocked = false, blockedText }) {
  const base = strengthLabel(score);

  // Nothing entered and nothing flagged yet: stay neutral. Greeting a customer
  // with "Too little detail" before they have typed a character reads as an
  // accusation, not guidance.
  const idle = score === 0 && !blocked;

  const tone = idle ? 'idle' : blocked ? 'bad' : base.tone;
  const text = idle
    ? 'Fill in your address details to see how complete it is'
    : blocked
      ? blockedText || 'Incomplete — complete the fields marked in red'
      : base.text;

  return (
    <div className={`eq-strength eq-strength--${tone}`}>
      <div className="eq-strength__head">
        <span className="eq-strength__title">Address strength</span>
        <div
          className="eq-strength__dots"
          role="meter"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`Address strength: ${text}`}
        >
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`eq-dot ${i < score ? 'eq-dot--on' : ''}`} />
          ))}
        </div>
      </div>
      <p className="eq-strength__text">{text}</p>
    </div>
  );
}
