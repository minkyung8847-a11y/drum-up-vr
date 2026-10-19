import { useEffect, useRef, useState } from 'react';
import { Check, Images } from 'lucide-react';
import { DRUM_ENVIRONMENTS } from './drumEnvironments';
import type { DrumEnvironmentId } from './drumEnvironments';

export function EnvironmentSwitcher({ selected, onSelect }: {
  selected: DrumEnvironmentId; onSelect: (id: DrumEnvironmentId) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div className="vr-background-switcher" ref={root} onKeyDown={event => {
    if (event.key === 'Escape') { setOpen(false); button.current?.focus(); }
    if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const items = [...root.current!.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
        (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }}>
    <button ref={button} type="button" className="vr-background-button" aria-label="Change background"
      aria-haspopup="menu" aria-expanded={open} title="Change background" onClick={() => setOpen(value => !value)}>
      <Images size={17} strokeWidth={1.5} aria-hidden="true" />
    </button>
    {open && <div className="vr-background-menu" role="menu" aria-label="Background environments">
      {DRUM_ENVIRONMENTS.map(environment => <button key={environment.id} type="button" role="menuitemradio"
        aria-checked={environment.id === selected} onClick={() => { onSelect(environment.id); setOpen(false); button.current?.focus(); }}>
        <span className={`vr-background-swatch vr-background-swatch-${environment.id}`} aria-hidden="true" />
        <span><strong>{environment.name}</strong><small>{environment.description}</small></span>
        {environment.id === selected && <Check size={15} aria-hidden="true" />}
      </button>)}
    </div>}
  </div>;
}
