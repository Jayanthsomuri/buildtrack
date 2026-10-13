// Create / edit form for a worker. The same fields go to POST and PUT /workers.

import ActionForm from './ActionForm';
import SubmitButton from './SubmitButton';
import { TRADES, ROLES } from '@/lib/constants';
import { label } from '@/lib/format';

export default function WorkerForm({ action, worker, submitText }) {
  return (
    <ActionForm action={action} className="card form">
      <div className="group">
        <label className="field">
          First name
          <input name="firstName" defaultValue={worker?.firstName} required />
        </label>
        <label className="field">
          Last name
          <input name="lastName" defaultValue={worker?.lastName} required />
        </label>
        <label className="field">
          Phone
          <input name="phone" type="tel" defaultValue={worker?.phone ?? ''} placeholder="614-555-0101" />
        </label>
      </div>

      <div className="group">
        <label className="field">
          Trade
          <select name="trade" defaultValue={worker?.trade ?? 'framing'}>
            {TRADES.map((trade) => (
              <option key={trade} value={trade}>{label(trade)}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Role
          <select name="role" defaultValue={worker?.role ?? 'worker'}>
            {ROLES.map((role) => (
              <option key={role} value={role}>{label(role)}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Only when editing: new workers always start active. */}
      {worker && (
        <label className="checkbox">
          <input type="hidden" name="activeField" value="1" />
          <input type="checkbox" name="active" defaultChecked={worker.active} />
          Active (can be assigned to projects)
        </label>
      )}

      <div className="actions">
        <SubmitButton>{submitText}</SubmitButton>
      </div>
    </ActionForm>
  );
}
