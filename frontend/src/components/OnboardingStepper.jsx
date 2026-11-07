import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { cx } from './ui.jsx';

const STEPS = ['Your needs', 'Your plan', 'Verification', 'Installation'];

// The four-step journey as one slim bar: done steps link back, the current one is red.
export default function OnboardingStepper({ currentStep = 1, quoteId = null, orderId = null, className = '' }) {
  const href = id => ({ 1: '/advisor', 2: quoteId ? `/quote/${quoteId}` : null, 3: '/app/kyc', 4: orderId ? `/app/orders/${orderId}` : '/track' })[id];
  return (
    <nav aria-label="Your progress" className={cx('mb-8', className)}>
      <ol className="flex items-center gap-2 sm:gap-3">
        {STEPS.map((name, index) => {
          const id = index + 1;
          const state = id < currentStep ? 'done' : id === currentStep ? 'current' : 'todo';
          const target = state !== 'todo' ? href(id) : null;
          const body = (
            <span className="flex items-center gap-2">
              <span className={cx('grid h-6 w-6 flex-none place-items-center rounded-full text-xs font-semibold', state === 'done' && 'bg-ok-600 text-white', state === 'current' && 'bg-brand-600 text-white', state === 'todo' && 'border border-[#d4d4da] bg-white text-ink-muted')}>{state === 'done' ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : id}</span>
              <span className={cx('hidden whitespace-nowrap text-sm sm:inline', state === 'current' ? 'font-semibold text-ink' : 'text-ink-muted')}>{name}</span>
            </span>
          );
          return (
            <li key={name} className="flex flex-1 items-center gap-2 last:flex-none sm:gap-3" aria-current={state === 'current' ? 'step' : undefined}>
              {target ? <Link to={target} className="rounded-full hover:opacity-80">{body}</Link> : body}
              {id < STEPS.length && <span className={cx('h-px flex-1', id < currentStep ? 'bg-ok-600' : 'bg-line')} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
