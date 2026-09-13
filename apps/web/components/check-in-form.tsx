import { checkIn } from '@/lib/actions';
import type { KeyResult } from '@/lib/api';

export function CheckInForm({ kr }: { kr: KeyResult }) {
  const action = checkIn.bind(null, kr.id);
  return (
    <form action={action} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input name="value" type="number" step="any" defaultValue={kr.currentValue} style={{ width: 80, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6 }} required />
      <select name="confidence" defaultValue={kr.confidence ?? 'on_track'} style={{ padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6, background: '#fff' }}>
        <option value="on_track">On track</option>
        <option value="at_risk">A rischio</option>
        <option value="off_track">Off track</option>
      </select>
      <button className="btn sm">Check-in</button>
    </form>
  );
}
