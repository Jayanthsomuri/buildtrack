// Create / edit form for a project. The same fields go to POST and PUT /projects.

import ActionForm from './ActionForm';
import SubmitButton from './SubmitButton';
import { HOME_TYPES, STATUSES } from '@/lib/constants';
import { label } from '@/lib/format';

export default function ProjectForm({ action, project, submitText }) {
  const address = project?.address ?? {};
  const location = project?.location ?? {};

  return (
    <ActionForm action={action} className="card form">
      <label className="field wide">
        Project name
        <input name="name" defaultValue={project?.name} required placeholder="Maple Ridge Lot 14" />
      </label>

      <fieldset className="group">
        <legend>Address</legend>
        <label className="field wide">
          Street
          <input name="street" defaultValue={address.street} required />
        </label>
        <label className="field">
          City
          <input name="city" defaultValue={address.city} required />
        </label>
        <label className="field small">
          State
          <input name="state" defaultValue={address.state} required maxLength={2} placeholder="OH" />
        </label>
        <label className="field small">
          ZIP
          <input name="zip" defaultValue={address.zip} required inputMode="numeric" />
        </label>
      </fieldset>

      <fieldset className="group">
        <legend>Location (optional)</legend>
        <label className="field">
          Community
          <input name="community" defaultValue={location.community ?? ''} />
        </label>
        <label className="field small">
          Lot #
          <input name="lotNumber" defaultValue={location.lotNumber ?? ''} />
        </label>
        <label className="field small">
          Latitude
          <input name="latitude" type="number" step="any" defaultValue={location.latitude ?? ''} />
        </label>
        <label className="field small">
          Longitude
          <input name="longitude" type="number" step="any" defaultValue={location.longitude ?? ''} />
        </label>
      </fieldset>

      <div className="group">
        <label className="field">
          Home type
          <select name="homeType" defaultValue={project?.homeType ?? 'single-family'}>
            {HOME_TYPES.map((type) => (
              <option key={type} value={type}>{label(type)}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Deadline
          <input name="deadline" type="date" defaultValue={project?.deadline} required />
        </label>
        <label className="field">
          Status
          <select name="status" defaultValue={project?.status ?? 'planning'}>
            {STATUSES.map((status) => (
              <option key={status} value={status}>{label(status)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="actions">
        <SubmitButton>{submitText}</SubmitButton>
      </div>
    </ActionForm>
  );
}
